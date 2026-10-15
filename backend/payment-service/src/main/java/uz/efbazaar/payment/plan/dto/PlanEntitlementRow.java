package uz.efbazaar.payment.plan.dto;

import uz.efbazaar.payment.plan.domain.PlanEntitlement;

import java.time.Instant;
import java.util.UUID;

/** {@code value == null} means unlimited. */
public record PlanEntitlementRow(String planCode, String key, String value,
                                 UUID updatedBy, Instant updatedAt) {
    public static PlanEntitlementRow of(PlanEntitlement e) {
        return new PlanEntitlementRow(e.planCode(), e.key(), e.getValue(), e.getUpdatedBy(), e.getUpdatedAt());
    }
}
