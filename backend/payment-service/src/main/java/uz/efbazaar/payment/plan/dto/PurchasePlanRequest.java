package uz.efbazaar.payment.plan.dto;

import jakarta.validation.constraints.*;
import uz.efbazaar.payment.plan.domain.PlanPeriod;

public record PurchasePlanRequest(
        @NotBlank String planCode,
        @NotNull PlanPeriod period,
        /** What the buyer saw. A mismatch means the admin changed the price meanwhile. */
        @NotNull @Positive Long expectedPriceTiyin,
        @NotBlank @Size(max = 100) String idempotencyKey) {}
