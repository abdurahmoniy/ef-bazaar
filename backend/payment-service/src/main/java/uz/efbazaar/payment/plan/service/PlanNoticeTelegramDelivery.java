package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import uz.efbazaar.payment.notify.AdminTelegramNotifier;
import java.util.UUID;

/**
 * Supplemental best-effort delivery. The claim commits BEFORE the external call.
 * An ambiguous crash/timeout is never automatically resent; the durable in-app
 * notice remains available. SENDING/UNCONFIRMED mean unknown, never delivered.
 */
@Service
@RequiredArgsConstructor
public class PlanNoticeTelegramDelivery {
    private final JdbcTemplate jdbc;
    private final AdminTelegramNotifier notifier;

    public void dispatch() {
        var ids = jdbc.queryForList("SELECT id FROM plan_notices WHERE telegram_status='PENDING' "
                + "ORDER BY created_at LIMIT 1000", UUID.class);
        for (UUID id : ids) {
            int claimed = jdbc.update("UPDATE plan_notices n SET telegram_status='SENDING' "
                    + "FROM user_subscriptions s WHERE n.id=? AND n.telegram_status='PENDING' "
                    + "AND s.user_id=n.user_id AND s.last_paid_expires_at=n.paid_expires_at "
                    + "AND s.plan_code <> 'STAFF' "
                    + "AND NOT (s.plan_code IN ('PRO','MAX') AND s.expires_at IS NULL)", id);
            if (claimed == 0) {
                jdbc.update("UPDATE plan_notices SET telegram_status='NOT_CONFIGURED' "
                        + "WHERE id=? AND telegram_status='PENDING'", id);
                continue;
            }
            boolean delivered = jdbc.queryForObject("SELECT telegram_id,kind FROM plan_notices WHERE id=?",
                    (rs,row) -> notifier.deliverPlanNotice(rs.getLong(1),rs.getString(2)),id);
            jdbc.update("UPDATE plan_notices SET telegram_status=? WHERE id=? AND telegram_status='SENDING'",
                    delivered ? "SENT" : "UNCONFIRMED", id);
        }
    }
}
