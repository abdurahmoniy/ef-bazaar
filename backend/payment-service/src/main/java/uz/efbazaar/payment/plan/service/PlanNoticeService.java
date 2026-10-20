package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import uz.efbazaar.payment.plan.dto.PlanNoticeResponse;
import uz.efbazaar.payment.plan.repository.UserSubscriptionRepository;
import java.sql.*;
import java.time.*;
import java.util.*;

@Service
@RequiredArgsConstructor
public class PlanNoticeService {
    private final JdbcTemplate jdbc;
    private final UserSubscriptionRepository subscriptions;
    private final Clock clock;

    /** Lock each subscription so a renewal cannot race notice creation. Unique key handles job overlap. */
    @Transactional
    public void generate() {
        Instant now = clock.instant();
        UUID cursor = new UUID(0, 0);
        while (true) {
            var ids = jdbc.queryForList("SELECT user_id FROM user_subscriptions "
                    + "WHERE last_paid_expires_at <= ? AND user_id > ? ORDER BY user_id LIMIT 1000",
                    UUID.class, Timestamp.from(now.plus(Duration.ofDays(3))), cursor);
            if (ids.isEmpty()) return;
            for (UUID id : ids) {
                var sub = subscriptions.lockByUserId(id).orElseThrow();
                Instant end = sub.getLastPaidExpiresAt();
                if (end == null || end.isAfter(now.plus(Duration.ofDays(3)))
                        || "STAFF".equals(sub.getPlanCode())
                        || (("PRO".equals(sub.getPlanCode()) || "MAX".equals(sub.getPlanCode()))
                            && sub.getExpiresAt() == null)) continue;
                Instant grace = end.plus(Duration.ofDays(30));
                if (end.isAfter(now)) insert(id, "EXPIRING", end, grace, now);
                else {
                    insert(id, "EXPIRED", end, grace, now);
                    if (!grace.isAfter(now)) insert(id, "GRACE_ENDED", end, grace, now);
                }
            }
            cursor = ids.getLast();
        }
    }

    private void insert(UUID user, String kind, Instant end, Instant grace, Instant now) {
        Long telegram = jdbc.query("SELECT telegram_id FROM plan_purchases WHERE user_id=? "
                + "AND expires_at=? ORDER BY created_at DESC LIMIT 1",
                rs -> rs.next() ? (Long) rs.getObject(1) : null, user, Timestamp.from(end));
        jdbc.update("INSERT INTO plan_notices(id,user_id,kind,paid_expires_at,grace_ends_at,created_at,"
                + "telegram_id,telegram_status) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
                UUID.randomUUID(), user, kind, Timestamp.from(end), Timestamp.from(grace), Timestamp.from(now),
                telegram, telegram == null ? "NOT_CONFIGURED" : "PENDING");
    }

    @Transactional(readOnly = true)
    public List<PlanNoticeResponse> list(UUID user) {
        // Old terms disappear after renewal; history remains durable for audit/deduplication.
        return jdbc.query("SELECT n.* FROM plan_notices n JOIN user_subscriptions s ON s.user_id=n.user_id "
                + "AND s.last_paid_expires_at=n.paid_expires_at WHERE n.user_id=? AND s.plan_code <> 'STAFF' "
                + "AND NOT (s.plan_code IN ('PRO','MAX') AND s.expires_at IS NULL) "
                + "ORDER BY n.created_at DESC,n.kind LIMIT 100", (rs, row) -> map(rs), user);
    }

    @Transactional
    public PlanNoticeResponse markRead(UUID user, UUID id) {
        int updated = jdbc.update("UPDATE plan_notices SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",
                Timestamp.from(clock.instant()), id, user);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Notice not found");
        return jdbc.queryForObject("SELECT * FROM plan_notices WHERE id=? AND user_id=?",
                (rs, row) -> map(rs), id, user);
    }

    private PlanNoticeResponse map(ResultSet rs) throws SQLException {
        Timestamp read = rs.getTimestamp("read_at");
        return new PlanNoticeResponse(rs.getObject("id", UUID.class),rs.getString("kind"),
                rs.getTimestamp("paid_expires_at").toInstant(),rs.getTimestamp("grace_ends_at").toInstant(),
                rs.getTimestamp("created_at").toInstant(), read == null ? null : read.toInstant());
    }
}
