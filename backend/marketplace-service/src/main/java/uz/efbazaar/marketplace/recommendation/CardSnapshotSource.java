package uz.efbazaar.marketplace.recommendation;

import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardSnapshot;
import uz.efbazaar.outbox.SnapshotSource;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** efbazaar katalogidagi kartaning hozirgi holati (reyting, o'yinchi, META oynasi). */
@Component
public class CardSnapshotSource implements SnapshotSource {

    private final CardCatalogReader catalog;

    public CardSnapshotSource(CardCatalogReader catalog) {
        this.catalog = catalog;
    }

    @Override
    public String source() {
        return RecommendationTopics.SOURCE_CARD;
    }

    @Override
    public String topic() {
        return RecommendationTopics.CARD_SNAPSHOT;
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        long efhubId;
        try {
            efhubId = Long.parseLong(entityId);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        CardFacts f = catalog.read(List.of(efhubId)).get(efhubId);
        if (f == null) {
            return Optional.empty();
        }
        return Optional.of(new CardSnapshot(RecommendationTopics.idempotencyKey(source(), entityId, version),
                f.efhubId(), f.playerId(), f.type(), f.overallRating(), f.metaTier(), f.metaPriority(),
                f.activeFrom(), f.activeUntil(), version, Instant.now()));
    }
}
