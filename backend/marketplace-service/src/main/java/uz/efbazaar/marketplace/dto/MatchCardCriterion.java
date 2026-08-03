package uz.efbazaar.marketplace.dto;

import java.util.UUID;

public record MatchCardCriterion(long efhubId, UUID playerId, Importance importance) {

    public enum Importance {
        NORMAL(1), PRIORITY(3);

        private final int weight;

        Importance(int weight) {
            this.weight = weight;
        }

        public int weight() {
            return weight;
        }
    }

    public int weight() {
        return importance.weight();
    }
}
