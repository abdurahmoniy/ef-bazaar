package uz.efbazaar.auth.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.repository.UserRepository;

/**
 * Adds the recipient's Telegram identity to trade-service's mailbox handover
 * and republishes it for the bot.
 *
 * <p>Same shape as {@link ChatCreatedEnricher} and for the same reason: auth
 * owns Telegram IDs, and no other service may read this database for them.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MailboxHandedOverEnricher {

    static final String INPUT_TOPIC = "efbazaar.trade.mailbox-handed-over";
    static final String OUTPUT_TOPIC = "efbazaar.notifications.mailbox-handed-over";

    private final UserRepository userRepository;
    private final KafkaTemplate<String, Object> kafka;

    @KafkaListener(
            topics = INPUT_TOPIC,
            groupId = "auth-service-mailbox-handover-notifier",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.auth.kafka.MailboxHandedOverDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional(readOnly = true)
    public void onHandedOver(MailboxHandedOverDto e) {
        if (e == null || e.userId() == null) {
            log.warn("mailbox-handed-over with no recipient — dropping notification");
            return;
        }
        var user = userRepository.findById(e.userId()).orElse(null);
        if (user == null) {
            log.warn("mailbox-handed-over: user {} not found — dropping notification", e.userId());
            return;
        }
        // Republished even without a Telegram identity. The bot drops it, but
        // the topic is the record of what was announced, and a user who links
        // Telegram later should not leave a hole in it.
        kafka.send(OUTPUT_TOPIC, e.userId().toString(), new MailboxHandoverNotificationEvent(
                e.tradeId(), e.userId(), user.getTelegramId(),
                e.mailboxEmail(), e.outcome(), e.occurredAt()));
    }
}
