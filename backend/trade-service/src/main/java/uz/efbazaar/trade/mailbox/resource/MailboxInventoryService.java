package uz.efbazaar.trade.mailbox.resource;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.config.MailboxDomains;
import uz.efbazaar.trade.mailbox.release.MailboxDeletionService;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** Durable requests, atomic complete snapshots, and conservative absence reconciliation. */
@Service
@RequiredArgsConstructor
public class MailboxInventoryService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final MailboxDomains domains;
    private final KafkaTemplate<String, Object> kafka;
    private final Clock clock;
    private final MailboxDeletionService deletions;

    @Transactional
    public UUID requestRefresh() {
        UUID id = UUID.randomUUID();
        if (domains.all().isEmpty() || domains.all().size() > 50) throw new IllegalStateException("Invalid inventory domain count");
        jdbc.update("""
            INSERT INTO mailbox_inventory_runs(id,domains,requested_at,status,next_dispatch_at)
            VALUES (?,?::jsonb,?,'PENDING',?)
            """, id, encode(domains.all()), Timestamp.from(clock.instant()), Timestamp.from(clock.instant()));
        return id;
    }

    @Transactional
    public void ensureRefresh() {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(62024038)", Boolean.class))) return;
        var last = jdbc.queryForList("SELECT requested_at FROM mailbox_inventory_runs ORDER BY sequence DESC LIMIT 1", Timestamp.class);
        if (last.isEmpty() || last.getFirst().toInstant().isBefore(clock.instant().minusSeconds(300))) requestRefresh();
    }

    @Transactional
    public void dispatchPending() {
        var pending = jdbc.queryForList("""
            SELECT id,domains::text AS domains,requested_at FROM mailbox_inventory_runs
             WHERE status IN ('PENDING','SENT','RECEIVING') AND next_dispatch_at <= ?
             ORDER BY sequence LIMIT 10 FOR UPDATE SKIP LOCKED
            """, Timestamp.from(clock.instant()));
        for (var run : pending) {
            UUID id = (UUID) run.get("id");
            if (((Timestamp) run.get("requested_at")).toInstant().isBefore(clock.instant().minusSeconds(600))) {
                fail(id, "OBSERVATION_TIMEOUT");
                continue;
            }
            try {
                List<String> requested = json.readValue((String) run.get("domains"), new TypeReference<>() {});
                kafka.send(MailboxInventoryEvents.REQUEST, id.toString(), new MailboxInventoryEvents.Request(id, requested))
                    .get(10, TimeUnit.SECONDS);
                jdbc.update("""
                    UPDATE mailbox_inventory_runs SET status=CASE WHEN status='PENDING' THEN 'SENT' ELSE status END,
                      dispatched_at=?,next_dispatch_at=?,dispatch_attempts=dispatch_attempts+1 WHERE id=?
                    """, Timestamp.from(clock.instant()), Timestamp.from(clock.instant().plusSeconds(60)), id);
            } catch (Exception error) {
                if (error instanceof InterruptedException) Thread.currentThread().interrupt();
                jdbc.update("""
                    UPDATE mailbox_inventory_runs SET error='REQUEST_PUBLISH_FAILED',
                      next_dispatch_at=?,dispatch_attempts=dispatch_attempts+1 WHERE id=?
                    """, Timestamp.from(clock.instant().plusSeconds(30)), id);
            }
        }
    }

    @Transactional
    public void observe(MailboxInventoryEvents.Observed event) {
        if (event == null || event.requestId() == null) return;
        // One projection lock orders overlapping runs and page arrivals across replicas.
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(62024038)", Object.class);
        var found = jdbc.queryForList("SELECT *,domains::text AS domain_json FROM mailbox_inventory_runs WHERE id=? FOR UPDATE", event.requestId());
        if (found.isEmpty()) return; // Only requests we actually made can influence resources.
        var run = found.getFirst();
        if (List.of("COMPLETE", "ERROR").contains(run.get("status"))) return;
        if (!Boolean.TRUE.equals(event.success())) {
            fail(event.requestId(), "WORKER_OBSERVATION_FAILED");
            return;
        }
        Instant requestedAt = ((Timestamp) run.get("requested_at")).toInstant();
        List<String> requested;
        try { requested = json.readValue((String) run.get("domain_json"), new TypeReference<>() {}); }
        catch (Exception invalid) { throw new IllegalStateException(invalid); }
        if (event.observedAt() == null || event.observedAt().isBefore(requestedAt)
            || event.observedAt().isAfter(clock.instant().plusSeconds(60)) || event.page() == null
            || event.page() < 0 || event.page() > 99 || event.lastPage() == null
            || event.mailboxes() == null || event.mailboxes().size() > 100) {
            fail(event.requestId(), "INVALID_OBSERVATION"); return;
        }
        var seen = new HashSet<String>();
        for (var entry : event.mailboxes()) {
            if (entry == null || entry.mailboxEmail() == null || entry.mailboxEmail().length() > 254
                || !entry.mailboxEmail().matches("[^\\s@]+@[^\\s@]+")
                || !entry.mailboxEmail().equals(entry.mailboxEmail().toLowerCase(java.util.Locale.ROOT))
                || !requested.contains(entry.mailboxEmail().substring(entry.mailboxEmail().lastIndexOf('@') + 1))
                || entry.usedBytes() == null || entry.usedBytes() < 0 || entry.quotaBytes() == null
                || entry.quotaBytes() < 0 || entry.active() == null || !seen.add(entry.mailboxEmail())) {
                fail(event.requestId(), "INVALID_MAILBOX_ENTRY"); return;
            }
        }
        Timestamp previousAt = (Timestamp) run.get("observed_at");
        Integer last = (Integer) run.get("last_page");
        if (previousAt != null && !previousAt.toInstant().equals(event.observedAt().truncatedTo(java.time.temporal.ChronoUnit.MICROS))
            || last != null && (event.page() > last || event.lastPage() && !last.equals(event.page()))) {
            fail(event.requestId(), "INCONSISTENT_PAGES"); return;
        }
        String payload = encode(event.mailboxes());
        var previous = jdbc.queryForList("SELECT mailboxes::text AS payload,last_page FROM mailbox_inventory_pages WHERE request_id=? AND page=?",
            event.requestId(), event.page());
        if (!previous.isEmpty()) {
            try {
                if (!json.readTree((String) previous.getFirst().get("payload")).equals(json.readTree(payload))
                    || !previous.getFirst().get("last_page").equals(event.lastPage())) fail(event.requestId(), "CONFLICTING_PAGE");
            } catch (Exception invalid) { throw new IllegalStateException(invalid); }
            return;
        }
        if (event.lastPage() && jdbc.queryForObject("SELECT count(*) FROM mailbox_inventory_pages WHERE request_id=? AND page>?",
                Long.class, event.requestId(), event.page()) > 0) {
            fail(event.requestId(), "INCONSISTENT_LAST_PAGE"); return;
        }
        jdbc.update("INSERT INTO mailbox_inventory_pages(request_id,page,last_page,mailboxes) VALUES (?,?,?,?::jsonb)",
            event.requestId(), event.page(), event.lastPage(), payload);
        if (event.lastPage()) last = event.page();
        jdbc.update("UPDATE mailbox_inventory_runs SET status='RECEIVING',observed_at=?,last_page=?,error=NULL WHERE id=?",
            Timestamp.from(event.observedAt().truncatedTo(java.time.temporal.ChronoUnit.MICROS)), last, event.requestId());
        if (last == null || jdbc.queryForObject("SELECT count(*) FROM mailbox_inventory_pages WHERE request_id=?", Long.class, event.requestId()) != last + 1) return;
        var pages = jdbc.queryForList("SELECT mailboxes::text FROM mailbox_inventory_pages WHERE request_id=? ORDER BY page", String.class, event.requestId());
        var rows = new java.util.ArrayList<MailboxInventoryEvents.Entry>();
        for (String page : pages) {
            try { rows.addAll(json.readValue(page, new TypeReference<List<MailboxInventoryEvents.Entry>>() {})); }
            catch (Exception invalid) { throw new IllegalStateException(invalid); }
        }
        seen.clear();
        if (rows.size() > 10_000 || rows.stream().anyMatch(entry -> !seen.add(entry.mailboxEmail()))) {
            fail(event.requestId(), "DUPLICATE_OR_OVERSIZED_INVENTORY"); return;
        }
        Long newest = jdbc.queryForObject("SELECT max(sequence) FROM mailbox_inventory_runs", Long.class);
        if (((Number) run.get("sequence")).longValue() == newest) apply(event.requestId(), event.observedAt(), (String) run.get("domain_json"), rows);
        jdbc.update("UPDATE mailbox_inventory_runs SET status='COMPLETE',error=NULL WHERE id=?", event.requestId());
    }

    private void apply(UUID request, Instant at, String requested, List<MailboxInventoryEvents.Entry> rows) {
        Timestamp observed = Timestamp.from(at);
        jdbc.update("""
            UPDATE mailbox_inventory_current SET mailcow_present=false,observed_at=?,request_id=?
             WHERE split_part(email,'@',2) IN (SELECT jsonb_array_elements_text(?::jsonb))
            """, observed, request, requested);
        jdbc.update("""
            INSERT INTO mailbox_inventory_current(email,mailcow_present,observed_at,request_id)
             SELECT email,false,?,? FROM mailboxes WHERE provisioned_at <= ?
              AND split_part(email,'@',2) IN (SELECT jsonb_array_elements_text(?::jsonb))
            ON CONFLICT(email) DO NOTHING
            """, observed, request, observed, requested);
        for (var entry : rows) jdbc.update("""
            INSERT INTO mailbox_inventory_current(email,used_bytes,quota_bytes,active,mailcow_present,observed_at,usage_observed_at,request_id)
             VALUES (?,?,?,?,true,?,?,?) ON CONFLICT(email) DO UPDATE SET used_bytes=excluded.used_bytes,
              quota_bytes=excluded.quota_bytes,active=excluded.active,mailcow_present=true,
              observed_at=excluded.observed_at,usage_observed_at=excluded.usage_observed_at,request_id=excluded.request_id
            """, entry.mailboxEmail(), entry.usedBytes(), entry.quotaBytes(), entry.active(), observed, observed, request);
        // Absence only closes a pre-existing, explicitly requested deletion. It
        // never selects new deletion targets or removes ownership by itself.
        var absent = jdbc.queryForList("""
            SELECT m.id FROM mailboxes m JOIN mailbox_inventory_current i ON i.email=m.email
             WHERE i.request_id=? AND NOT i.mailcow_present AND m.deletion_status IN ('PENDING','FAILED')
             ORDER BY m.id
            """, UUID.class, request);
        for (UUID mailbox : absent) deletions.confirmAbsentFromInventory(mailbox, at);
    }

    private void fail(UUID id, String reason) {
        jdbc.update("UPDATE mailbox_inventory_runs SET status='ERROR',error=? WHERE id=?", reason, id);
    }

    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception invalid) { throw new IllegalStateException(invalid); }
    }
}
