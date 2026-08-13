package uz.efbazaar.payment.card.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PlatformCardCreateRequest(
        @NotBlank @Size(max = 32) String pan,
        @NotBlank @Size(max = 64) String holderName,
        @NotNull @Min(1) @Max(12) Short expiryMonth,
        @NotNull @Min(2000) @Max(2100) Short expiryYear
) {}
