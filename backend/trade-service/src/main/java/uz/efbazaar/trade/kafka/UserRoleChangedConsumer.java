package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;

/**
 * Keeps the admin catalogue honest about who is still allowed to work.
 *
 * <p>Profiles are deactivated, never deleted — the rating history has to
 * survive so a re-granted admin does not come back with a clean slate.
 *
 * <p>Idempotent: replays land on the same boolean.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserRoleChangedConsumer {

    private final TradeAdminProfileService profiles;

    @KafkaListener(
            topics = "efbazaar.auth.user-role-changed",
            groupId = "trade-service-user-role-changed",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.UserRoleChangedDto"}
    )
    public void onRoleChanged(UserRoleChangedDto e) {
        if (e == null || e.userId() == null) {
            log.warn("user-role-changed with no userId, skipping");
            return;
        }
        if (e.grantsTradeAdmin()) {
            profiles.reactivate(e.userId());
        } else {
            profiles.deactivate(e.userId());
        }
    }
}
