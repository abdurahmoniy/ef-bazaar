package uz.efbazaar.payment.plan.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A user moved to a different plan, or their current one ran out.
 *
 * <p>Carries the plan's name and not what it grants: the two change for
 * different reasons and at different rates. A price change touches one plan and
 * every user on it — re-sending a per-user payload for all of them would be
 * thousands of messages saying the same thing.
 */
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
    public SubscriptionChanged(UUID userId, String planCode, Instant expiresAt, Instant occurredAt) {
        this(userId, planCode, expiresAt, occurredAt, 0, null);
    }
}
