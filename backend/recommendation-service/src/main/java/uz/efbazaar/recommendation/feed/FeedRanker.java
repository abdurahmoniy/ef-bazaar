package uz.efbazaar.recommendation.feed;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import uz.efbazaar.recommendation.match.Criterion;
import uz.efbazaar.recommendation.match.MatchEngine;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Normallashtirilmagan match bali: {@code earned = Σ weight·credit}. Nomzod — profildagi
 * o'yinchilardan kamida bittasi bor e'lon (yo'q o'yinchi 0 beradi, natijaga ta'sir qilmaydi).
 */
@Repository
public class FeedRanker {

    private final JdbcTemplate jdbc;

    public FeedRanker(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<UUID> rank(List<Criterion> profile, UUID viewerId, int limit) {
        if (profile.isEmpty()) {
            return List.of();
        }
        List<Object> args = new ArrayList<>();
        String wanted = MatchEngine.wanted(profile, args);
        args.add(viewerId);
        args.add(viewerId);
        args.add(limit);
        String sql = """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                hits AS (
                    SELECT inventory.listing_id,
                           wanted.efhub_id,
                           wanted.weight,
                           MAX(CASE WHEN inventory.efhub_id = wanted.efhub_id THEN 1.0 ELSE 0.75 END) AS credit
                    FROM wanted
                    JOIN listing_cards_view inventory ON inventory.player_id = wanted.player_id
                    GROUP BY inventory.listing_id, wanted.efhub_id, wanted.weight
                )
                SELECT hits.listing_id
                FROM hits
                JOIN listings_view listing ON listing.listing_id = hits.listing_id
                WHERE listing.status = 'ACTIVE'
                  AND listing.seller_id <> ?
                  AND NOT EXISTS (
                      SELECT 1 FROM user_likes liked
                      WHERE liked.user_id = ? AND liked.listing_id = hits.listing_id AND liked.liked)
                GROUP BY hits.listing_id, listing.value_score
                HAVING SUM(hits.weight * hits.credit) > 0
                ORDER BY SUM(hits.weight * hits.credit) DESC,
                         listing.value_score DESC NULLS LAST,
                         hits.listing_id ASC
                LIMIT ?
                """.formatted(wanted);
        return jdbc.queryForList(sql, UUID.class, args.toArray());
    }
}
