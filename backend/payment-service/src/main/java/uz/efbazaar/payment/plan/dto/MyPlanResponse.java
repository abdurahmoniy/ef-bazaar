package uz.efbazaar.payment.plan.dto;

import java.time.Instant;
import java.util.Map;

/** What the signed-in user is on, and what it gets them. */
public record MyPlanResponse(
        String code,
        Instant expiresAt,
        Map<String, String> entitlements,
        Instant lastPaidExpiresAt,
        Instant graceEndsAt) {
    public MyPlanResponse(String code, Instant expiresAt, Map<String, String> entitlements) {
        this(code, expiresAt, entitlements, null, null);
    }
}
