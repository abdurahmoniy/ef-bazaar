package uz.efbazaar.marketplace.recommendation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** recommendation tartiblagan ID'lar + bozor filtrlari. ids ≤ 1000. */
public record RankedListingsRequest(
        @NotNull @Size(max = 1000) List<UUID> ids,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Boolean priceNegotiable,
        String search,
        Map<String, Object> attributes,
        @Min(0) int page,
        @Min(1) @Max(100) int size) {
}
