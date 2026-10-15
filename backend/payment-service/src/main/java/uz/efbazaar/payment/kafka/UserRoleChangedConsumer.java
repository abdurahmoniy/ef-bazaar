package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.plan.service.StaffPlanService;

/**
 * Puts ADMINs on the unlimited STAFF plan and takes them off it again.
 *
 * <p>Idempotent: a replay lands on the same subscription row. A record that
 * cannot be read goes to the DLT via {@link KafkaErrorHandlingConfig}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserRoleChangedConsumer {

    private final StaffPlanService staff;

    @KafkaListener(
            topics = PaymentTopics.USER_ROLE_CHANGED,
            groupId = "${payment.kafka.user-role-changed-group:payment-service-user-role-changed}",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.payment.kafka.UserRoleChangedDto",
                    // auth-service serialises with Spring's JsonSerializer, which stamps its
                    // own class name into __TypeId__. JsonDeserializer trusts that header over
                    // value.default.type, so without this the record dies with
                    // ClassNotFoundException inside poll(): the offset is never committed and
                    // the container re-polls it for ever (trade-service lost a day's disk to
                    // exactly this on 2026-09-07). UserRoleChangedDto is a deliberate local
                    // mirror; ignoring the header is what makes it usable.
                    "spring.json.use.type.headers=false"
            }
    )
    public void onRoleChanged(UserRoleChangedDto e) {
        if (e == null || e.userId() == null) {
            log.warn("user-role-changed with no userId, skipping");
            return;
        }
        staff.onRoleChanged(e.userId(), e.oldRole(), e.newRole());
    }
}
