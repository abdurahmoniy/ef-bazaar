package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record MatchHit(
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
}
