package uz.efbazaar.trade.plan.kafka;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Mirrors of payment-service's plan payloads. */
public final class PlanEvents {

    public static final String TOPIC_SUBSCRIPTION_CHANGED = "efbazaar.payment.subscription-changed";
    public static final String TOPIC_PLAN_ENTITLEMENTS    = "efbazaar.payment.plan-entitlements";

    public record SubscriptionChanged(
            UUID userId,
            String planCode,
            Instant expiresAt,
            Instant occurredAt) {}

    /** A null value in the map means the plan grants this without a ceiling. */
    public record PlanEntitlementsSnapshot(
            String planCode,
            Map<String, String> entitlements,
            Instant occurredAt) {}

    private PlanEvents() {}
}
