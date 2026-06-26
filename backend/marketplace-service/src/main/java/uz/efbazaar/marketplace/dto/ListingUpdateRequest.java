package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;

/**
 * Tahrirlanadigan listing maydonlari. Hamma maydon optional (PATCH semantikasi):
 * null → o'zgartirmaslik.
 */
public record ListingUpdateRequest(
        @Size(min = 10, max = 4000)
        String description,

        List<@NotBlank @Size(max = 64) String> valuablePlayers,

        Boolean hasGooglePlayLink,

        @Min(1) @Max(9)
        Integer highestDivisionLevel,

        @PositiveOrZero
        Integer androidCoins,

        @PositiveOrZero
        Integer iosCoins,

        @PositiveOrZero
        Integer teamStrength,

        @DecimalMin(value = "0.00", inclusive = true)
        BigDecimal price,

        Boolean priceNegotiable
) {}
