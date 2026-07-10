package uz.efbazaar.trade.card.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import uz.efbazaar.trade.card.domain.CardBrand;

public record CardCreateRequest(
        @NotBlank String pan,
        @Min(1) @Max(12) short expiryMonth,
        @Min(2020) @Max(2099) short expiryYear,
        @NotNull CardBrand brand,
        String cvv,
        boolean saveToProfile
) {
}
