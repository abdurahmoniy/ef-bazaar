package uz.efbazaar.marketplace.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record ListingMatchHit(
        UUID listingId,
        BigDecimal score,
        int exactCount,
        int alternateCount,
        int missingCount
) {
}
