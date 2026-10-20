package uz.efbazaar.payment.plan.dto;

import java.time.Instant;
import java.util.Map;

/**
 * What one plan grants, whole.
 *
 * <p>Published as a unit rather than key by key so a reader can replace its
 * copy outright — applying changes one at a time leaves a window where a plan
 * is half old and half new, and a limit read in that window is neither.
 *
 * <p>{@code entitlements} maps a key to its value, and a null value means
 * unlimited. The map itself never contains a key the plan does not grant.
 */
public record PlanEntitlementsSnapshot(
        String planCode,
        Map<String, String> entitlements,
        Instant occurredAt,
        long version,
        String idempotencyKey) {
    public PlanEntitlementsSnapshot(String planCode, Map<String, String> entitlements, Instant occurredAt) {
        this(planCode, entitlements, occurredAt, 0, null);
    }
}
