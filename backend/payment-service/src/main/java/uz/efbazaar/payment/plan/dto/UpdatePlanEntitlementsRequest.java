package uz.efbazaar.payment.plan.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record UpdatePlanEntitlementsRequest(@NotEmpty List<@Valid Item> entitlements) {
    /** {@code value} null = unlimited; otherwise a whole number {@code >= 0}. */
    public record Item(@NotBlank String planCode, @NotBlank String key, String value) {}
}
