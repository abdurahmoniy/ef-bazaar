package uz.efbazaar.marketplace.cards.sync;

import uz.efbazaar.marketplace.cards.CardType;

import java.time.Instant;
import java.util.List;

public record CardsAddedEvent(
        Instant occurredAt,
        int totalAdded,
        List<Added> cards
) {
    public record Added(long efhubId, CardType type, String name, Integer overallRating) {}

    public static final String TOPIC = "efbazaar.marketplace.cards-added";
}
