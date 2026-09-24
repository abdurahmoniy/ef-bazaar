package uz.efbazaar.auth.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.repository.UserRepository;

/**
 * Enriches trade-service's trade action notification with the recipient's
 * Telegram identity and republishes it for the bot on {@code efbazaar.notifications.trade-action}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeActionEnricher {

    static final String INPUT_TOPIC = "efbazaar.trade.action-notification";
    static final String OUTPUT_TOPIC = "efbazaar.notifications.trade-action";

    private final UserRepository userRepository;
    private final KafkaTemplate<String, Object> kafka;

    @KafkaListener(
            topics = INPUT_TOPIC,
            groupId = "auth-service-trade-action-notifier",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.auth.kafka.TradeActionNotificationDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional(readOnly = true)
    public void onTradeAction(TradeActionNotificationDto e) {
        if (e == null || e.recipientUserId() == null) {
            log.warn("trade-action with no recipient — dropping notification");
            return;
        }
        User user = userRepository.findById(e.recipientUserId()).orElse(null);
        if (user == null) {
            log.warn("trade-action: user {} not found — dropping notification", e.recipientUserId());
            return;
        }

        Long telegramId = user.getTelegramId();
        String displayName = user.getTelegramFirstName() != null && !user.getTelegramFirstName().isBlank()
                ? user.getTelegramFirstName()
                : user.getTelegramUsername();

        kafka.send(OUTPUT_TOPIC, e.recipientUserId().toString(), new TradeActionNotificationEvent(
                e.tradeId(),
                e.chatId(),
                e.recipientUserId(),
                telegramId,
                displayName,
                e.actionType(),
                e.amountUzs(),
                e.details(),
                e.kind(),
                e.occurredAt()
        ));
        log.info("Emitted trade action notification for user={} actionType={} telegramId={}",
                e.recipientUserId(), e.actionType(), telegramId);
    }
}
