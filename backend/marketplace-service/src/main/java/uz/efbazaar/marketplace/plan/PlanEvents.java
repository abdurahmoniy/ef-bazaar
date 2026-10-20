package uz.efbazaar.marketplace.plan;

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
            Instant occurredAt,
            long version,
            String idempotencyKey,
            Instant lastPaidExpiresAt) {
        public SubscriptionChanged(UUID userId, String planCode, Instant expiresAt, Instant occurredAt,
                                   long version, String idempotencyKey) {
            this(userId, planCode, expiresAt, occurredAt, version, idempotencyKey, null);
        }
    }

    /** A null value in the map means the plan grants this without a ceiling. */
    public record PlanEntitlementsSnapshot(
            String planCode,
            Map<String, String> entitlements,
            Instant occurredAt,
            long version,
            String idempotencyKey) {}

    private PlanEvents() {}
}
