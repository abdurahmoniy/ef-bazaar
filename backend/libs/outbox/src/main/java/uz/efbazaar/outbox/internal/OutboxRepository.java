package uz.efbazaar.outbox.internal;

import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Outbox'ning barcha SQL'i shu yerda. claim* metodlari chaqiruvchining tranzaksiyasida ishlaydi. */
public class OutboxRepository {

    private final JdbcTemplate jdbc;

    public OutboxRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long insert(String topic, String key, byte[] payload, String headersJson) {
        Long id = jdbc.queryForObject("""
                INSERT INTO outbox_events (topic, message_key, payload, headers)
                VALUES (?, ?, ?, ?::jsonb)
                RETURNING id
                """, Long.class, topic, key, payload, headersJson);
        return id == null ? -1 : id;
    }

    public List<OutboxRow> claimEvents(int limit) {
        return jdbc.query("""
                SELECT id, topic, message_key, payload, headers::text AS headers
                  FROM outbox_events
                 WHERE published_at IS NULL
                 ORDER BY id
                 LIMIT ?
                   FOR UPDATE SKIP LOCKED
                """, (rs, n) -> new OutboxRow(rs.getLong("id"), rs.getString("topic"),
                rs.getString("message_key"), rs.getBytes("payload"), rs.getString("headers")), limit);
    }

    public void markPublished(List<Long> ids) {
        if (ids.isEmpty()) {
            return;
        }
        jdbc.update("UPDATE outbox_events SET published_at = now() WHERE id = ANY (?)",
                (Object) ids.toArray(Long[]::new));
    }

    public void markFailed(long id, String error) {
        jdbc.update("UPDATE outbox_events SET attempts = attempts + 1, last_error = ? WHERE id = ?",
                error, id);
    }

    public long pendingCount() {
        Long n = jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE published_at IS NULL", Long.class);
        return n == null ? 0 : n;
    }

    public double oldestPendingAgeSeconds() {
        Double age = jdbc.queryForObject("""
                SELECT COALESCE(EXTRACT(EPOCH FROM now() - min(created_at)), 0)
                  FROM outbox_events WHERE published_at IS NULL
                """, Double.class);
        return age == null ? 0 : age;
    }

    public int deletePublishedBefore(Instant cutoff) {
        return jdbc.update("DELETE FROM outbox_events WHERE published_at < ?", Timestamp.from(cutoff));
    }

    public void mark(String source, String entityId) {
        jdbc.update("""
                INSERT INTO outbox_snapshot_pending (source, entity_id)
                VALUES (?, ?)
                ON CONFLICT (source, entity_id) DO UPDATE SET marked_at = clock_timestamp()
                """, source, entityId);
    }

    public List<SnapshotMark> claimSnapshots(int limit) {
        return jdbc.query("""
                SELECT source, entity_id, marked_at
                  FROM outbox_snapshot_pending
                 ORDER BY marked_at
                 LIMIT ?
                   FOR UPDATE SKIP LOCKED
                """, (rs, n) -> new SnapshotMark(rs.getString("source"), rs.getString("entity_id"),
                rs.getTimestamp("marked_at").toInstant()), limit);
    }

    public void deleteSnapshot(SnapshotMark mark) {
        jdbc.update("""
                DELETE FROM outbox_snapshot_pending
                 WHERE source = ? AND entity_id = ? AND marked_at <= ?
                """, mark.source(), mark.entityId(), Timestamp.from(mark.markedAt()));
    }

    public long nextSnapshotVersion() {
        Long v = jdbc.queryForObject("SELECT nextval('outbox_snapshot_version_seq')", Long.class);
        return v == null ? 0 : v;
    }
}
