package uz.efbazaar.trade.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Payment-owned snapshots. Version comparison and replacement share one DB transaction. */
@Service
@RequiredArgsConstructor
public class PlanProjection {
    private final JdbcTemplate jdbc;

    @Transactional
    public void replacePlan(String planCode, Map<String,String> grants, long version,
                            String idempotencyKey, Instant occurredAt) {
        if (!accept("plan", planCode, version, idempotencyKey, occurredAt)) return;
        jdbc.update("DELETE FROM plan_entitlement_view WHERE plan_code = ?", planCode);
        if (grants != null) grants.forEach((key, value) -> jdbc.update("""
            INSERT INTO plan_entitlement_view(plan_code, key, value, updated_at) VALUES (?, ?, ?, ?)
            """, planCode, key, value, Timestamp.from(occurredAt)));
    }

    @Transactional
    public void userMoved(UUID userId, String planCode, Instant expiresAt, long version,
                          String idempotencyKey, Instant occurredAt) {
        userMoved(userId, planCode, expiresAt, null, version, idempotencyKey, occurredAt);
    }

    @Transactional
    public void userMoved(UUID userId, String planCode, Instant expiresAt, Instant lastPaidExpiresAt, long version,
                          String idempotencyKey, Instant occurredAt) {
        if (userId == null || planCode == null || planCode.isBlank()) return;
        if (!accept("user", userId.toString(), version, idempotencyKey, occurredAt)) return;
        // STANDARD is retained as a tombstone: delayed paid events must not resurrect a subscription.
        jdbc.update("""
            INSERT INTO user_plan_view(user_id, plan_code, expires_at, updated_at, last_paid_expires_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET plan_code = EXCLUDED.plan_code,
                expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at,
                last_paid_expires_at = COALESCE(EXCLUDED.last_paid_expires_at, user_plan_view.last_paid_expires_at)
            """, userId, planCode, expiresAt == null ? null : Timestamp.from(expiresAt), Timestamp.from(occurredAt),
                lastPaidExpiresAt != null ? Timestamp.from(lastPaidExpiresAt)
                    : java.util.Set.of("PRO", "MAX").contains(planCode) && expiresAt != null ? Timestamp.from(expiresAt) : null);
    }

    private boolean accept(String kind, String id, long version, String key, Instant at) {
        // Old-format records remain readable but cannot grant paid rights. A versioned replay repairs them.
        if (id == null || id.isBlank() || version <= 0 || key == null || key.isBlank() || at == null) return false;
        if (jdbc.update("INSERT INTO plan_event_receipts(idempotency_key) VALUES (?) ON CONFLICT DO NOTHING", key) == 0)
            return false;
        return jdbc.update("""
            INSERT INTO plan_projection_state(kind, entity_id, version, occurred_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(kind, entity_id) DO UPDATE SET version = EXCLUDED.version, occurred_at = EXCLUDED.occurred_at
            WHERE plan_projection_state.version < EXCLUDED.version
            """, kind, id, version, Timestamp.from(at)) == 1;
    }

    public record CapabilitySnapshot(String planCode, boolean subscriptionFresh,
                                     boolean planFresh, boolean granted, String value, boolean paidSubscriptionLive, boolean subscriptionKnown) {}

    /** One statement: values and their version/freshness metadata use the same MVCC snapshot,
     * including when callers already hold a READ_COMMITTED transaction or a JPA persistence context. */
    @Transactional(readOnly = true)
    public CapabilitySnapshot readCapability(UUID userId, String key) {
        return snapshots(userId, java.util.List.of(key), true).get(key);
    }

    /** Existing owned mail keeps its last-known access during delivery outages; real expiry still applies. */
    @Transactional(readOnly = true)
    public CapabilitySnapshot readMailboxAccess(UUID userId, String key) {
        return snapshots(userId, java.util.List.of(key), false).get(key);
    }

    /** Related allocation grants must not be combined across a concurrent catalog/subscription edit. */
    @Transactional(readOnly = true)
    public Map<String, CapabilitySnapshot> readCapabilities(UUID userId, java.util.List<String> keys) {
        return snapshots(userId, keys, true);
    }

    private Map<String, CapabilitySnapshot> snapshots(UUID userId, java.util.List<String> keys,
                                                     boolean requireFreshSubscription) {
        if (keys.isEmpty()) return Map.of();
        String requested = String.join(",", java.util.Collections.nCopies(keys.size(), "(CAST(? AS text))"));
        var arguments = new java.util.ArrayList<Object>();
        arguments.add(userId);
        arguments.add(requireFreshSubscription);
        arguments.addAll(keys);
        var result = new java.util.LinkedHashMap<String, CapabilitySnapshot>();
        jdbc.query("""
            WITH user_state AS (
                SELECT u.plan_code, u.expires_at, u.user_id IS NOT NULL AS known,
                    COALESCE(u.user_id IS NOT NULL AND s.version > 0
                        AND s.occurred_at > statement_timestamp() - interval '24 hours'
                        AND s.occurred_at <= statement_timestamp() + interval '60 seconds', false) AS fresh
                FROM (SELECT CAST(? AS uuid) AS id) requested
                LEFT JOIN user_plan_view u ON u.user_id = requested.id
                LEFT JOIN plan_projection_state s ON s.kind = 'user' AND s.entity_id = CAST(u.user_id AS text)
            ), effective AS (
                SELECT CASE WHEN (fresh OR NOT ?) AND (expires_at IS NULL OR expires_at > statement_timestamp())
                    THEN COALESCE(plan_code, 'STANDARD') ELSE 'STANDARD' END AS plan_code, fresh, known,
                    COALESCE(plan_code <> 'STANDARD' AND (expires_at IS NULL OR expires_at > statement_timestamp()), false)
                        AS paid_subscription_live FROM user_state
            )
            SELECT requested.key AS requested_key, e.plan_code, e.fresh AS subscription_fresh,
                COALESCE(s.version > 0 AND s.occurred_at > statement_timestamp() - interval '24 hours'
                    AND s.occurred_at <= statement_timestamp() + interval '60 seconds', false) AS plan_fresh,
                g.key IS NOT NULL AS granted, g.value, e.paid_subscription_live, e.known
            FROM effective e
            CROSS JOIN (VALUES %s) requested(key)
            LEFT JOIN plan_projection_state s ON s.kind = 'plan' AND s.entity_id = e.plan_code
            LEFT JOIN plan_entitlement_view g ON g.plan_code = e.plan_code AND g.key = requested.key
            """.formatted(requested), (org.springframework.jdbc.core.RowCallbackHandler) rs ->
                result.put(rs.getString("requested_key"), new CapabilitySnapshot(rs.getString("plan_code"),
                rs.getBoolean("subscription_fresh"), rs.getBoolean("plan_fresh"),
                rs.getBoolean("granted"), rs.getString("value"), rs.getBoolean("paid_subscription_live"), rs.getBoolean("known"))), arguments.toArray());
        return result;
    }
}
