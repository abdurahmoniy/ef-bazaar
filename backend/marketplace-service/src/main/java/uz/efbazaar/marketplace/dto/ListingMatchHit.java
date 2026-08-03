package uz.efbazaar.marketplace.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record ListingMatchHit(
        UUID listingId,
        BigDecimal score,
        int exactCount,
        int alternateCount,
        int missingCount,
        List<Long> exactEfhubIds,
        List<Long> alternateEfhubIds,
        List<Long> missingEfhubIds,
        BigDecimal earnedWeight,
        BigDecimal possibleWeight
) {
    public ListingMatchHit(UUID listingId, BigDecimal score, int exactCount,
                           int alternateCount, int missingCount) {
        this(listingId, score, exactCount, alternateCount, missingCount,
                List.of(), List.of(), List.of(), score, BigDecimal.ONE);
    }
}
