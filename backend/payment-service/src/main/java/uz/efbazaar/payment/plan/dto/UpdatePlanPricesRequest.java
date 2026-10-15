package uz.efbazaar.payment.plan.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import uz.efbazaar.payment.plan.domain.PlanPeriod;

import java.util.List;

public record UpdatePlanPricesRequest(@NotEmpty List<@Valid Item> prices) {
    public record Item(@NotBlank String planCode, @NotNull PlanPeriod period,
                       @NotNull @Positive Long priceTiyin) {}
}
