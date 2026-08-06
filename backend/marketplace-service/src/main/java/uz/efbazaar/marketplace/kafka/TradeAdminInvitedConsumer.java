package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.service.NotificationService;

/**
 * Turns a trade-admin invitation into a notification-centre row, so the admin
 * sees it in the bell they already use rather than a second one.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeAdminInvitedConsumer {

    private final NotificationService notifications;

    @KafkaListener(
            topics = "efbazaar.trade.admin-invited",
            groupId = "marketplace-trade-admin-invited",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeAdminInvitedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onInvited(TradeAdminInvitedDto e) {
        if (e == null || e.adminId() == null) {
            log.warn("admin-invited with no adminId, skipping");
            return;
        }
        notifications.tradeAdminInvited(e.adminId(), e.tradeId(), e.priceUzs());
    }
}
