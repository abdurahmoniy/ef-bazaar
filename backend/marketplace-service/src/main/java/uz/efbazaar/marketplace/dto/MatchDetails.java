package uz.efbazaar.marketplace.dto;

import java.math.BigDecimal;
import java.util.List;

public record MatchDetails(
        int percent,
        int exactCount,
        int alternateCount,
        int missingCount,
        int selectedCount,
        int strictness,
        List<Long> exactEfhubIds,
        List<Long> alternateEfhubIds,
        List<Long> missingEfhubIds,
        List<Long> priorityEfhubIds,
        BigDecimal earnedWeight,
        BigDecimal possibleWeight
) {
    public MatchDetails(int percent, int exactCount, int alternateCount,
                        int missingCount, int selectedCount, int strictness) {
        this(percent, exactCount, alternateCount, missingCount, selectedCount, strictness,
                List.of(), List.of(), List.of(), List.of(), BigDecimal.ZERO, BigDecimal.ZERO);
    }
}
