package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;

public record ListingCreateRequest(
        @NotBlank @Size(min = 10, max = 4000)
        String description,

        List<@NotBlank @Size(max = 64) String> valuablePlayers,

        boolean hasGooglePlayLink,

        @Min(1) @Max(9)
        int highestDivisionLevel,

        @PositiveOrZero
        int androidCoins,

        @PositiveOrZero
        int iosCoins,

        @PositiveOrZero
        int teamStrength,

        @NotNull @DecimalMin(value = "0.00", inclusive = true)
        BigDecimal price,

        boolean priceNegotiable
) {}
