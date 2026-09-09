package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.security.AuthAdminClient;
import uz.efbazaar.marketplace.security.AuthAdminClient.AdminSummary;
import uz.efbazaar.marketplace.service.NotificationService;

import java.util.List;
import java.util.UUID;

/**
 * Turns payout events into the bell.
 *
 * <p>Two directions: a new ticket goes to every admin, and its outcome goes
 * back to the person whose wallet it came out of. The Telegram topic already
 * carries the first one — this is the half that survives a phone being face
 * down, and the half that can be clicked through to the ticket.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WithdrawalConsumer {

    private final NotificationService notifications;
    private final AuthAdminClient admins;

    @KafkaListener(
            topics = "efbazaar.payment.withdrawal-requested",
            groupId = "marketplace-withdrawal-requested",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.WithdrawalRequestedDto",
                    // payment-service `__TypeId__` sarlavhasini qo'yadi va undagi
                    // klass bizda YO'Q — DTO mahalliy nusxa. Sarlavhaga ishonsak,
                    // xato poll() ichida yuz beradi: offset commit qilinmaydi va
                    // konteyner o'sha xabarni cheksiz qayta o'qiydi.
                    "spring.json.use.type.headers=false"
            }
    )
    public void onRequested(WithdrawalRequestedDto e) {
        if (e == null || e.ticketId() == null) {
            log.warn("withdrawal-requested without a ticket id — dropping");
            return;
        }
        List<UUID> ids = admins.admins().stream().map(AdminSummary::id).toList();
        if (ids.isEmpty()) {
            // Not an error worth retrying: the money is frozen either way and
            // the Telegram topic still announced it.
            log.warn("No admins to notify about withdrawal {}", e.ticketId());
            return;
        }
        notifications.withdrawalRequested(ids, e.ticketId());
    }

    @KafkaListener(
            topics = "efbazaar.payment.withdrawal-closed",
            groupId = "marketplace-withdrawal-closed",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.WithdrawalClosedDto",
                    // payment-service `__TypeId__` sarlavhasini qo'yadi va undagi
                    // klass bizda YO'Q — DTO mahalliy nusxa. Sarlavhaga ishonsak,
                    // xato poll() ichida yuz beradi: offset commit qilinmaydi va
                    // konteyner o'sha xabarni cheksiz qayta o'qiydi.
                    "spring.json.use.type.headers=false"
            }
    )
    public void onClosed(WithdrawalClosedDto e) {
        if (e == null || e.ticketId() == null || e.userId() == null) {
            log.warn("withdrawal-closed without ids — dropping");
            return;
        }
        notifications.withdrawalClosed(e.userId(), e.ticketId(), e.paid());
    }
}
