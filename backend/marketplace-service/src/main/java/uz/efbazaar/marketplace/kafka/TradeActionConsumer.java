package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.service.NotificationService;

/**
 * Consumes trade action events and inserts corresponding in-app notification rows.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeActionConsumer {

    private final NotificationService notifications;

    @KafkaListener(
            topics = "efbazaar.trade.action-notification",
            groupId = "marketplace-trade-action-notifier",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeActionDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onTradeAction(TradeActionDto e) {
        if (e == null || e.recipientUserId() == null) {
            log.warn("trade-action with no recipient, skipping");
            return;
        }

        NotificationType type = mapActionType(e.actionType());
        if (type == null) {
            log.warn("Unknown trade action type: {}", e.actionType());
            return;
        }

        notifications.tradeAction(e.recipientUserId(), e.tradeId(), e.chatId(), type);
        log.info("Saved in-app trade action notification for user={} type={}",
                e.recipientUserId(), type);
    }

    private NotificationType mapActionType(String actionType) {
        if (actionType == null) return null;
        return switch (actionType) {
            case "PROPOSAL_CREATED" -> NotificationType.TRADE_PROPOSAL_CREATED;
            case "TRADE_STARTED" -> NotificationType.TRADE_STARTED;
            case "EMAIL_CHANGED" -> NotificationType.TRADE_EMAIL_CHANGED;
            case "PASSWORD_SENT" -> NotificationType.TRADE_PASSWORD_SENT;
            case "TRADE_SUCCESS" -> NotificationType.TRADE_SUCCESS;
            case "TRADE_REJECTED" -> NotificationType.TRADE_REJECTED;
            case "TRADE_ORPHANED" -> NotificationType.TRADE_ORPHANED;
            default -> null;
        };
    }
}
