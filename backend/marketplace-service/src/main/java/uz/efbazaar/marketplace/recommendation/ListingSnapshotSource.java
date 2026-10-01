package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardRef;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.ListingSnapshot;
import uz.efbazaar.outbox.SnapshotSource;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** listings + listing_cards ning hozirgi holati. Qator o'chirilgan bo'lsa — hech narsa yuborilmaydi. */
@Component
public class ListingSnapshotSource implements SnapshotSource {

    private final JdbcTemplate jdbc;

    public ListingSnapshotSource(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String source() {
        return RecommendationTopics.SOURCE_LISTING;
    }

    @Override
    public String topic() {
        return RecommendationTopics.LISTING_SNAPSHOT;
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        UUID id = UUID.fromString(entityId);
        List<CardRef> cards = jdbc.query(
                "SELECT efhub_id, player_id FROM listing_cards WHERE listing_id = ? ORDER BY ordinal",
                (rs, n) -> new CardRef(rs.getLong("efhub_id"), rs.getObject("player_id", UUID.class)), id);
        return jdbc.query("SELECT seller_id, status, price, value_score FROM listings WHERE id = ?",
                (rs, n) -> (Object) new ListingSnapshot(
                        RecommendationTopics.idempotencyKey(source(), entityId, version), id,
                        rs.getObject("seller_id", UUID.class), rs.getString("status"),
                        rs.getBigDecimal("price"), (Double) rs.getObject("value_score"),
                        cards, version, Instant.now()), id)
                .stream().findFirst();
    }
}
