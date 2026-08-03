package uz.efbazaar.marketplace.dto;

import java.math.BigDecimal;
import java.util.List;

public record MatchRequest(List<MatchCardCriterion> criteria, int strictness) {

    public MatchRequest {
        criteria = List.copyOf(criteria);
    }

    public boolean anyPositiveOverlap() {
        return strictness == 1;
    }

    public BigDecimal minimumScore() {
        if (anyPositiveOverlap()) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(strictness, 1);
    }
}
