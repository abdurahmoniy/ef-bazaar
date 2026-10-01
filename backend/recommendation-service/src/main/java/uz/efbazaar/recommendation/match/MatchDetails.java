package uz.efbazaar.recommendation.match;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/** JSON shakli marketplace {@code MatchDetails} bilan bir xil — frontend o'zgarmasin. */
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

    public static MatchDetails of(MatchHit hit, MatchRequest request) {
        return of(hit, request.strictness(), request.priorityEfhubIds());
    }

    public static MatchDetails of(MatchHit hit, int strictness, List<Long> priorityEfhubIds) {
        int selected = hit.exactCount() + hit.alternateCount() + hit.missingCount();
        int percent = hit.score() == null ? 0 : hit.score().multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP).intValue();
        return new MatchDetails(percent, hit.exactCount(), hit.alternateCount(), hit.missingCount(),
                selected, strictness, hit.exactEfhubIds(), hit.alternateEfhubIds(), hit.missingEfhubIds(),
                priorityEfhubIds, hit.earnedWeight(), hit.possibleWeight());
    }
}
