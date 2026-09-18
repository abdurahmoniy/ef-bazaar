package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.service.NotificationService;

/**
 * An escrow mailbox became somebody's, and the bell has to say so.
 *
 * <p>Two readings of the same fact, which is why the outcome picks the type: a
 * completed trade hands over the account they were given, and any other ending
 * hands back the box they were told to move their own account through. The
 * second is the one that matters most — a party who had already transferred
 * would otherwise never learn where their account went.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MailboxHandedOverConsumer {

    private final NotificationService notifications;
    private final uz.efbazaar.marketplace.account.ListingAccountLink accounts;

    @KafkaListener(
            topics = "efbazaar.trade.mailbox-handed-over",
            groupId = "marketplace-trade-mailbox-handed-over",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.MailboxHandedOverDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onHandedOver(MailboxHandedOverDto e) {
        if (e == null || e.userId() == null) {
            log.warn("mailbox-handed-over with no recipient, skipping");
            return;
        }
        boolean received = "RECEIVED".equals(e.outcome());
        NotificationType type = received
                ? NotificationType.TRADE_MAILBOX_RECEIVED
                : NotificationType.TRADE_MAILBOX_RETURNED;
        notifications.tradeMailboxHandedOver(e.userId(), e.tradeId(), type);

        // Faqat RECEIVED: qaytarilgan quti odamning o'z akkountiniki edi va
        // u allaqachon biriktirilgan.
        if (received) {
            accounts.onMailboxHandedOver(e.tradeId(), e.userId(), e.mailboxEmail());
        }
    }
}
