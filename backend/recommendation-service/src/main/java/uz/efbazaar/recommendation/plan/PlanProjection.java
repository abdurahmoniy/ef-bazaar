package uz.efbazaar.recommendation.plan;

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
        // Replays refresh projection_state without changing an unchanged grant's
        // effective time. Missing keys are still removed by the complete snapshot.
        for (String key : jdbc.queryForList("SELECT key FROM plan_entitlement_view WHERE plan_code=?", String.class, planCode)) {
            if (grants == null || !grants.containsKey(key))
                jdbc.update("DELETE FROM plan_entitlement_view WHERE plan_code=? AND key=?", planCode, key);
        }
        if (grants != null) grants.forEach((key, value) -> jdbc.update("""
            INSERT INTO plan_entitlement_view(plan_code, key, value, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(plan_code,key) DO UPDATE SET value=EXCLUDED.value,
                updated_at=CASE WHEN plan_entitlement_view.value IS DISTINCT FROM EXCLUDED.value
                    THEN EXCLUDED.updated_at ELSE plan_entitlement_view.updated_at END
            """, planCode, key, value, Timestamp.from(occurredAt)));
    }

    @Transactional
    public void userMoved(UUID userId, String planCode, Instant expiresAt, long version,
                          String idempotencyKey, Instant occurredAt) {
        if (userId == null || planCode == null || planCode.isBlank()) return;
        if (!accept("user", userId.toString(), version, idempotencyKey, occurredAt)) return;
        // STANDARD is retained as a tombstone: delayed paid events must not resurrect a subscription.
        jdbc.update("""
            INSERT INTO user_plan_view(user_id, plan_code, expires_at, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET plan_code = EXCLUDED.plan_code,
                expires_at = EXCLUDED.expires_at,
                updated_at = CASE WHEN user_plan_view.plan_code IS DISTINCT FROM EXCLUDED.plan_code
                    OR user_plan_view.expires_at IS DISTINCT FROM EXCLUDED.expires_at
                    THEN EXCLUDED.updated_at ELSE user_plan_view.updated_at END
            """, userId, planCode, expiresAt == null ? null : Timestamp.from(expiresAt), Timestamp.from(occurredAt));
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
                                     boolean planFresh, boolean granted, String value) {}

    /** One statement: values and their version/freshness metadata use the same MVCC snapshot,
     * including when callers already hold a READ_COMMITTED transaction or a JPA persistence context. */
    @Transactional(readOnly = true)
    public CapabilitySnapshot readCapability(UUID userId, String key) {
        return jdbc.queryForObject("""
            WITH user_state AS (
                SELECT u.plan_code, u.expires_at,
                    COALESCE(u.user_id IS NOT NULL AND s.version > 0
                        AND s.occurred_at > statement_timestamp() - interval '24 hours'
                        AND s.occurred_at <= statement_timestamp() + interval '60 seconds', false) AS fresh
                FROM (SELECT CAST(? AS uuid) AS id) requested
                LEFT JOIN user_plan_view u ON u.user_id = requested.id
                LEFT JOIN plan_projection_state s ON s.kind = 'user' AND s.entity_id = CAST(u.user_id AS text)
            ), effective AS (
                SELECT CASE WHEN fresh AND (expires_at IS NULL OR expires_at > statement_timestamp())
                    THEN plan_code ELSE 'STANDARD' END AS plan_code, fresh FROM user_state
            )
            SELECT e.plan_code, e.fresh AS subscription_fresh,
                COALESCE(s.version > 0 AND s.occurred_at > statement_timestamp() - interval '24 hours'
                    AND s.occurred_at <= statement_timestamp() + interval '60 seconds', false) AS plan_fresh,
                g.key IS NOT NULL AS granted, g.value
            FROM effective e
            LEFT JOIN plan_projection_state s ON s.kind = 'plan' AND s.entity_id = e.plan_code
            LEFT JOIN plan_entitlement_view g ON g.plan_code = e.plan_code AND g.key = ?
            """, (rs, n) -> new CapabilitySnapshot(rs.getString("plan_code"),
                rs.getBoolean("subscription_fresh"), rs.getBoolean("plan_fresh"),
                rs.getBoolean("granted"), rs.getString("value")), userId, key);
    }
    public record CapabilitiesSnapshot(boolean subscriptionFresh, boolean planFresh, Map<String,String> grants,
                                       Instant sourceTime, Map<String,Instant> grantSourceTimes) {}

    /** All grants required by one action share the same effective plan and MVCC snapshot. */
    @Transactional(readOnly = true)
    public CapabilitiesSnapshot readCapabilities(UUID userId) {
        return jdbc.query("""
            WITH user_state AS (
                SELECT u.plan_code, u.expires_at, u.updated_at AS source_time,
                    COALESCE(u.user_id IS NOT NULL AND s.version > 0
                        AND s.occurred_at > statement_timestamp() - interval '24 hours'
                        AND s.occurred_at <= statement_timestamp() + interval '60 seconds', false) AS fresh
                FROM (SELECT CAST(? AS uuid) AS id) requested
                LEFT JOIN user_plan_view u ON u.user_id = requested.id
                LEFT JOIN plan_projection_state s ON s.kind = 'user' AND s.entity_id = CAST(u.user_id AS text)
            ), effective AS (
                SELECT CASE WHEN fresh AND (expires_at IS NULL OR expires_at > statement_timestamp())
                    THEN plan_code ELSE 'STANDARD' END AS plan_code, fresh, source_time FROM user_state
            )
            SELECT e.fresh AS subscription_fresh, e.source_time,
                COALESCE(s.version > 0 AND s.occurred_at > statement_timestamp() - interval '24 hours'
                    AND s.occurred_at <= statement_timestamp() + interval '60 seconds', false) AS plan_fresh,
                g.key, g.value, g.updated_at AS grant_source_time
            FROM effective e
            LEFT JOIN plan_projection_state s ON s.kind = 'plan' AND s.entity_id = e.plan_code
            LEFT JOIN plan_entitlement_view g ON g.plan_code = e.plan_code
            """, rs -> {
                java.util.Map<String,String> grants = new java.util.LinkedHashMap<>();
                Map<String,Instant> grantSourceTimes = new java.util.LinkedHashMap<>();
                Instant sourceTime = null;
                boolean subscriptionFresh = false, planFresh = false;
                while (rs.next()) {
                    subscriptionFresh = rs.getBoolean("subscription_fresh");
                    planFresh = rs.getBoolean("plan_fresh");
                    sourceTime = rs.getTimestamp("source_time") == null ? null : rs.getTimestamp("source_time").toInstant();
                    String key = rs.getString("key");
                    if (key != null) {
                        grants.put(key, rs.getString("value"));
                        grantSourceTimes.put(key, rs.getTimestamp("grant_source_time").toInstant());
                    }
                }
                return new CapabilitiesSnapshot(subscriptionFresh, planFresh, grants, sourceTime, grantSourceTimes);
            }, userId);
    }

}
