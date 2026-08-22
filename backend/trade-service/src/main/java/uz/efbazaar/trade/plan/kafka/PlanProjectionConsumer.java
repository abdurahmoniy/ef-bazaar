package uz.efbazaar.trade.plan.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.plan.service.PlanProjection;

import java.util.Map;

/**
 * Feeds the local copy of who is on what, and what that grants.
 *
 * <p>{@code use.type.headers=false} because the producer stamps its own class
 * name and this service has no such class on its classpath.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PlanProjectionConsumer {

    private final PlanProjection projection;

    @KafkaListener(
            topics = PlanEvents.TOPIC_PLAN_ENTITLEMENTS,
            groupId = "trade-service-plan-entitlements",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.trade.plan.kafka.PlanEvents$PlanEntitlementsSnapshot",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onPlanEntitlements(PlanEvents.PlanEntitlementsSnapshot e) {
        if (e == null || e.planCode() == null) {
            log.warn("plan-entitlements with no plan, skipping");
            return;
        }
        projection.replacePlan(e.planCode(),
                e.entitlements() == null ? Map.of() : e.entitlements());
    }

    @KafkaListener(
            topics = PlanEvents.TOPIC_SUBSCRIPTION_CHANGED,
            groupId = "trade-service-subscription-changed",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.trade.plan.kafka.PlanEvents$SubscriptionChanged",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onSubscriptionChanged(PlanEvents.SubscriptionChanged e) {
        if (e == null || e.userId() == null || e.planCode() == null) {
            log.warn("subscription-changed with no user or plan, skipping");
            return;
        }
        projection.userMoved(e.userId(), e.planCode(), e.expiresAt());
    }
}
