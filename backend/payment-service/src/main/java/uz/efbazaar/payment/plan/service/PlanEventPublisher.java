package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.kafka.PaymentTopics;
import uz.efbazaar.payment.plan.dto.PlanEntitlementsSnapshot;
import uz.efbazaar.payment.plan.dto.SubscriptionChanged;

import java.time.Instant;
import java.util.UUID;

/**
 * Announces plans and who is on them.
 *
 * <p>Never lets a broker outage reach the caller: the row is already committed
 * by the time this runs, so throwing would fail an admin action whose work
 * succeeded. A lost event does cost something — a reader's copy goes stale —
 * but the startup republish puts it right, which is exactly why that exists.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PlanEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public void subscriptionChanged(UUID userId, String planCode, Instant expiresAt) {
        publish(PaymentTopics.SUBSCRIPTION_CHANGED, userId.toString(),
                new SubscriptionChanged(userId, planCode, expiresAt, Instant.now()));
    }

    public void planEntitlements(PlanEntitlementsSnapshot snapshot) {
        // Keyed by plan so a compacted topic keeps the newest per plan, and a
        // reader replaying from the start still ends on the current values.
        publish(PaymentTopics.PLAN_ENTITLEMENTS, snapshot.planCode(), snapshot);
    }

    private void publish(String topic, String key, Object payload) {
        try {
            kafka.send(topic, key, payload);
        } catch (RuntimeException e) {
            log.error("Could not publish {} for {}: {}", topic, key, e.getMessage());
        }
    }
}
