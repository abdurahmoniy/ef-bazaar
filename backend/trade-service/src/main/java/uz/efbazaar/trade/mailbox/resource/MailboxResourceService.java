package uz.efbazaar.trade.mailbox.resource;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.service.MailboxPreservationService;
import uz.efbazaar.trade.plan.service.MailboxAccessService;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MailboxResourceService {
    private final JdbcTemplate jdbc;
    private final MailboxAccessService access;
    private final MailboxPreservationService preservation;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<MailboxResource> resources(UUID user, boolean admin) {
        var result = new ArrayList<MailboxResource>();
        var rows = jdbc.queryForList("""
            SELECT m.id,m.email,m.owner_user_id,m.retained_user_id,m.kind,m.source,m.deleted_at,
              m.deletion_status,m.deletion_error,m.provisioning_status,m.provisioning_claim_id,m.provisioning_error,i.used_bytes,i.quota_bytes,i.usage_observed_at,
              i.observed_at,i.mailcow_present,
              EXISTS(SELECT 1 FROM trades t WHERE t.state NOT IN ('SUCCESS','REJECTED','ORPHANED')
                AND (t.mailbox_id=m.id OR EXISTS(SELECT 1 FROM trade_sides s WHERE s.trade_id=t.id AND s.mailbox_id=m.id))) AS active_trade,
              EXISTS(SELECT 1 FROM trades t WHERE t.state NOT IN ('SUCCESS','REJECTED','ORPHANED')
                AND (t.seller_id=m.owner_user_id OR t.buyer_id=m.owner_user_id)
                AND (t.mailbox_id=m.id OR EXISTS(SELECT 1 FROM trade_sides s WHERE s.trade_id=t.id AND s.mailbox_id=m.id))) AS party_trade
            FROM mailboxes m LEFT JOIN mailbox_inventory_current i ON i.email=m.email
            WHERE (? OR m.owner_user_id=? OR m.retained_user_id=?) ORDER BY m.created_at DESC,m.id
            """, admin, user, user);
        var latest = jdbc.queryForList("SELECT status,error FROM mailbox_inventory_runs ORDER BY sequence DESC LIMIT 1");
        var accessByOwner = new java.util.HashMap<UUID, Map<UUID, MailboxAccessService.Access>>();
        for (var row : rows) {
            UUID id = (UUID) row.get("id"), owner = (UUID) row.get("owner_user_id");
            var metadata = owner == null || row.get("deleted_at") != null ? null
                : accessByOwner.computeIfAbsent(owner, access::metadataFor).get(id);
            String hold = preservation.reason(id);
            boolean active = Boolean.TRUE.equals(row.get("active_trade"));
            boolean exempt = "ADMIN".equals(row.get("source")) || active && !Boolean.TRUE.equals(row.get("party_trade"));
            result.add(new MailboxResource(id, (String) row.get("email"), owner, (UUID) row.get("retained_user_id"),
                (String) row.get("kind"), metadata == null ? "RECOVERY" : metadata.accessState().name(),
                metadata == null ? null : metadata.paidExpiresAt(), metadata == null ? null : metadata.graceEndsAt(),
                metadata != null && metadata.selectedForFree(), exempt, active,
                (Long) row.get("used_bytes"), (Long) row.get("quota_bytes"), instant(row.get("usage_observed_at")),
                usageStatus(row, latest), usageError(latest), (Boolean) row.get("mailcow_present"), row.get("deleted_at") != null,
                (String) row.get("deletion_status"), (String) row.get("deletion_error"), hold != null, hold,
                (String) row.get("provisioning_status"), (UUID) row.get("provisioning_claim_id"),
                (String) row.get("provisioning_error")));
        }
        if (admin) {
            var orphans = jdbc.queryForList("""
                SELECT i.* FROM mailbox_inventory_current i LEFT JOIN mailboxes m ON m.email=i.email
                 WHERE m.id IS NULL AND i.mailcow_present ORDER BY i.email
                """);
            for (var row : orphans) result.add(new MailboxResource(null, (String) row.get("email"), null, null,
                "SERVER_ONLY", "RECOVERY", null, null, false, false, false,
                (Long) row.get("used_bytes"), (Long) row.get("quota_bytes"), instant(row.get("usage_observed_at")),
                usageStatus(row, latest), usageError(latest), (Boolean) row.get("mailcow_present"), false,
                "NONE", null, false, null, "NONE", null, null));
        }
        return result;
    }

    private String usageStatus(Map<String, Object> row, List<Map<String, Object>> latest) {
        if (!latest.isEmpty() && ("ERROR".equals(latest.getFirst().get("status")) || latest.getFirst().get("error") != null)) return "ERROR";
        Instant at = instant(row.get("usage_observed_at"));
        if (at == null) return "UNKNOWN";
        if (Boolean.FALSE.equals(row.get("mailcow_present"))) return "STALE";
        if (at.isBefore(clock.instant().minusSeconds(600))) return "STALE";
        return "FRESH";
    }
    private String usageError(List<Map<String, Object>> latest) {
        return latest.isEmpty() ? null : (String) latest.getFirst().get("error");
    }
    private Instant instant(Object value) { return value == null ? null : ((Timestamp) value).toInstant(); }
}
