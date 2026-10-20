package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.outbox.Outbox;
import uz.efbazaar.payment.kafka.PaymentTopics;
import uz.efbazaar.payment.plan.dto.PlanEntitlementsSnapshot;
import uz.efbazaar.payment.plan.dto.SubscriptionChanged;
import java.time.Instant;
import java.util.UUID;

/** Durable immutable events, called with the owning plan/subscription locked. */
@Component
@RequiredArgsConstructor
public class PlanEventPublisher {
    private final Outbox outbox;
    private final JdbcTemplate jdbc;

    public void subscriptionChanged(UUID userId, String planCode, Instant expiresAt) {
        subscriptionChanged(userId, planCode, expiresAt, null);
    }

    public void subscriptionChanged(UUID userId, String planCode, Instant expiresAt, Instant lastPaidExpiresAt) {
        long version = nextVersion();
        outbox.publish(PaymentTopics.SUBSCRIPTION_CHANGED, userId.toString(),
                new SubscriptionChanged(userId, planCode, expiresAt, Instant.now(), version,
                        "subscription:" + userId + ":" + version, lastPaidExpiresAt));
    }

    public void planEntitlements(PlanEntitlementsSnapshot snapshot) {
        long version = nextVersion();
        outbox.publish(PaymentTopics.PLAN_ENTITLEMENTS, snapshot.planCode(),
                new PlanEntitlementsSnapshot(snapshot.planCode(), snapshot.entitlements(), Instant.now(), version,
                        "plan:" + snapshot.planCode() + ":" + version));
    }

    private long nextVersion() {
        return jdbc.queryForObject("SELECT nextval('plan_event_version_seq')", Long.class);
    }
}
