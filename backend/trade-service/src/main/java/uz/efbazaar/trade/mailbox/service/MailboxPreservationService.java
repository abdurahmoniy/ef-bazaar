package uz.efbazaar.trade.mailbox.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import uz.efbazaar.trade.common.exception.ApiCodeException;
import java.util.UUID;

/** A preservation hold blocks destructive mail operations, never owner portability. */
@Service
@RequiredArgsConstructor
public class MailboxPreservationService {
    private final JdbcTemplate jdbc;
    private final java.time.Clock clock;

    public record Hold(boolean legalHold, String holdReason) {}

    @org.springframework.transaction.annotation.Transactional
    public Hold setHold(UUID adminId, UUID mailboxId, String reason) {
        String normalized = reason == null ? "" : reason.strip();
        if (normalized.isEmpty() || normalized.length() > 1000)
            throw new ApiCodeException(HttpStatus.BAD_REQUEST, "hold_reason_required", "Provide a reason of 1–1000 characters");
        final java.util.Map<String,Object> row;
        try { row = jdbc.queryForMap("SELECT id, deletion_status, deleted_at FROM mailboxes WHERE id = ? FOR UPDATE", mailboxId); }
        catch (org.springframework.dao.EmptyResultDataAccessException e) { throw new jakarta.persistence.EntityNotFoundException("Mailbox " + mailboxId); }
        if (row.get("deleted_at") != null || !"NONE".equals(row.get("deletion_status")))
            throw new ApiCodeException(HttpStatus.CONFLICT, "mailbox_deletion_unresolved",
                    "Mailbox deletion already started; preservation cannot be guaranteed");
        if (jdbc.update("UPDATE mailboxes SET preservation_hold_reason = ? WHERE id = ? AND preservation_hold_reason IS NULL",
                normalized, mailboxId) == 1) {
            jdbc.update("INSERT INTO mailbox_preservation_audit(id,mailbox_id,admin_id,reason,created_at) VALUES (?,?,?,?,?)",
                    UUID.randomUUID(), mailboxId, adminId, normalized, java.sql.Timestamp.from(clock.instant()));
        }
        return new Hold(true, reason(mailboxId));
    }

    public boolean isProtected(UUID mailboxId) { return reason(mailboxId) != null; }

    public void assertNotProtected(UUID mailboxId) {
        jdbc.queryForList("SELECT id FROM mailboxes WHERE id = ? FOR UPDATE", UUID.class, mailboxId);
        String reason = reason(mailboxId);
        if (reason != null) throw new ApiCodeException(HttpStatus.CONFLICT, "mailbox_preserved",
                "Pochta saqlash himoyasida: " + reason);
    }

    public String reason(UUID mailboxId) {
        var explicit = jdbc.queryForList("SELECT preservation_hold_reason FROM mailboxes WHERE id = ?", String.class, mailboxId);
        if (!explicit.isEmpty() && explicit.getFirst() != null) return explicit.getFirst();
        var reasons = jdbc.queryForList("""
            SELECT CASE WHEN t.escalated_at IS NOT NULL THEN 'DISPUTE'
                        WHEN t.state = 'ORPHANED' THEN 'UNRESOLVED_TRADE' ELSE 'LIVE_TRADE' END
              FROM trades t WHERE
               (t.mailbox_id = ? OR EXISTS (SELECT 1 FROM trade_sides s WHERE s.trade_id = t.id AND s.mailbox_id = ?))
               AND (t.state NOT IN ('SUCCESS','REJECTED','ORPHANED') OR t.escalated_at IS NOT NULL
                    OR (t.state = 'ORPHANED' AND COALESCE(t.terminal_reason, '') <> 'PROVISION_FAILED'))
             LIMIT 1
            """, String.class, mailboxId, mailboxId);
        return reasons.isEmpty() ? null : reasons.getFirst();
    }
}
