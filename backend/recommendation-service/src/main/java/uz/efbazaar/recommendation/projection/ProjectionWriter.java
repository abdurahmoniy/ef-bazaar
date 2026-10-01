package uz.efbazaar.recommendation.projection;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.recommendation.projection.Snapshots.CardRef;
import uz.efbazaar.recommendation.projection.Snapshots.CardSnapshot;
import uz.efbazaar.recommendation.projection.Snapshots.LikeToggled;
import uz.efbazaar.recommendation.projection.Snapshots.ListingSnapshot;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Snapshot'ni projection'ga yozadi. Ikki himoya: {@code consumed_events} aynan shu xabarning
 * takrorini, {@code version} esa kechikib kelgan eski holatni to'sadi.
 */
@Component
public class ProjectionWriter {

    private final JdbcTemplate jdbc;

    public ProjectionWriter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public boolean applyListing(ListingSnapshot s) {
        if (!claim(s.idempotencyKey())) return false;
        int changed = jdbc.update("""
                INSERT INTO listings_view (listing_id, seller_id, status, price, value_score, version, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, now())
                ON CONFLICT (listing_id) DO UPDATE
                   SET seller_id = EXCLUDED.seller_id,
                       status = EXCLUDED.status,
                       price = EXCLUDED.price,
                       value_score = EXCLUDED.value_score,
                       version = EXCLUDED.version,
                       updated_at = now()
                 WHERE listings_view.version < EXCLUDED.version
                """, s.listingId(), s.sellerId(), s.status(), s.price(), s.valueScore(), s.version());
        if (changed == 0) return false;

        jdbc.update("DELETE FROM listing_cards_view WHERE listing_id = ?", s.listingId());
        Map<Long, UUID> cards = new LinkedHashMap<>();
        if (s.cards() != null) {
            for (CardRef card : s.cards()) {
                if (card != null && card.playerId() != null) cards.putIfAbsent(card.efhubId(), card.playerId());
            }
        }
        List<Object[]> rows = cards.entrySet().stream()
                .map(e -> new Object[]{s.listingId(), e.getKey(), e.getValue()})
                .toList();
        if (!rows.isEmpty()) {
            jdbc.batchUpdate("INSERT INTO listing_cards_view (listing_id, efhub_id, player_id) VALUES (?, ?, ?)", rows);
        }
        return true;
    }

    @Transactional
    public boolean applyCard(CardSnapshot s) {
        if (!claim(s.idempotencyKey())) return false;
        return jdbc.update("""
                INSERT INTO cards_view (efhub_id, player_id, type, overall_rating, meta_tier, meta_priority,
                                        active_from, active_until, version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (efhub_id) DO UPDATE
                   SET player_id = EXCLUDED.player_id,
                       type = EXCLUDED.type,
                       overall_rating = EXCLUDED.overall_rating,
                       meta_tier = EXCLUDED.meta_tier,
                       meta_priority = EXCLUDED.meta_priority,
                       active_from = EXCLUDED.active_from,
                       active_until = EXCLUDED.active_until,
                       version = EXCLUDED.version
                 WHERE cards_view.version < EXCLUDED.version
                """, s.efhubId(), s.playerId(), s.type(), s.overallRating(), s.metaTier(), s.metaPriority(),
                timestamp(s.activeFrom()), timestamp(s.activeUntil()), s.version()) == 1;
    }

    @Transactional
    public boolean applyLike(LikeToggled s) {
        if (!claim(s.idempotencyKey())) return false;
        return jdbc.update("""
                INSERT INTO user_likes (user_id, listing_id, liked, version)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (user_id, listing_id) DO UPDATE
                   SET liked = EXCLUDED.liked,
                       version = EXCLUDED.version
                 WHERE user_likes.version < EXCLUDED.version
                """, s.userId(), s.listingId(), s.liked(), s.version()) == 1;
    }

    private boolean claim(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new IllegalArgumentException("idempotencyKey bo'sh");
        }
        return jdbc.update("INSERT INTO consumed_events (idempotency_key) VALUES (?) ON CONFLICT DO NOTHING",
                idempotencyKey) == 1;
    }

    private static Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
