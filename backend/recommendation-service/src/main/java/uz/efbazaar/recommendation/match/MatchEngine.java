package uz.efbazaar.recommendation.match;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * marketplace {@code JdbcListingMatchRepository} SQL'i projection ustida: exact karta 1.0,
 * shu o'yinchining boshqa kartasi 0.75, yo'q 0; {@code score = Σ(w·credit) / Σw}.
 */
@Repository
public class MatchEngine {

    private static final String PER_PLAYER = """
            per_player AS (
                SELECT listing.listing_id,
                       wanted.efhub_id,
                       wanted.player_id,
                       wanted.weight,
                       MAX(CASE
                           WHEN inventory.efhub_id = wanted.efhub_id THEN 1.0
                           WHEN inventory.player_id IS NOT NULL THEN 0.75
                           ELSE 0.0
                       END) AS credit
                FROM listings_view listing
                CROSS JOIN wanted
                LEFT JOIN listing_cards_view inventory
                  ON inventory.listing_id = listing.listing_id
                 AND inventory.player_id = wanted.player_id
                WHERE %s
                GROUP BY listing.listing_id, wanted.efhub_id, wanted.player_id, wanted.weight
            )""";

    private final JdbcTemplate jdbc;

    public MatchEngine(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Player filtri: chegaradan o'tgan ACTIVE e'lonlar. Tartib (P2):
     * {@code score DESC, value_score DESC NULLS LAST, listing_id}.
     */
    public List<UUID> rank(MatchRequest request, int limit) {
        List<Object> args = new ArrayList<>();
        String wanted = wanted(request.weighted(), args);
        String predicate = request.anyPositiveOverlap() ? "scored.score > ?" : "scored.score >= ?";
        args.add(request.minimumScore());
        args.add(limit);
        String sql = """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                %s,
                scored AS (
                    SELECT listing_id, SUM(weight * credit) / NULLIF(SUM(weight), 0) AS score
                    FROM per_player
                    GROUP BY listing_id
                )
                SELECT scored.listing_id
                FROM scored
                JOIN listings_view listing ON listing.listing_id = scored.listing_id
                WHERE %s
                ORDER BY scored.score DESC, listing.value_score DESC NULLS LAST, scored.listing_id ASC
                LIMIT ?
                """.formatted(wanted, PER_PLAYER.formatted("listing.status = 'ACTIVE'"), predicate);
        return jdbc.queryForList(sql, UUID.class, args.toArray());
    }

    /** Berilgan e'lonlar uchun to'liq tafsilot, holatidan qat'i nazar. Projection'da yo'q ID qaytmaydi. */
    public Map<UUID, MatchHit> hits(List<Criterion> criteria, Collection<UUID> listingIds) {
        if (criteria.isEmpty() || listingIds.isEmpty()) {
            return Map.of();
        }
        List<Object> args = new ArrayList<>();
        String wanted = wanted(criteria, args);
        String placeholders = listingIds.stream().map(ignored -> "?").collect(Collectors.joining(", "));
        args.addAll(listingIds);
        String sql = """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                %s
                SELECT listing_id,
                       SUM(weight * credit) / NULLIF(SUM(weight), 0) AS score,
                       COUNT(*) FILTER (WHERE credit = 1.0) AS exact_count,
                       COUNT(*) FILTER (WHERE credit = 0.75) AS alternate_count,
                       COUNT(*) FILTER (WHERE credit = 0.0) AS missing_count,
                       COALESCE(array_agg(efhub_id ORDER BY efhub_id) FILTER (WHERE credit = 1.0), '{}') AS exact_ids,
                       COALESCE(array_agg(efhub_id ORDER BY efhub_id) FILTER (WHERE credit = 0.75), '{}') AS alternate_ids,
                       COALESCE(array_agg(efhub_id ORDER BY efhub_id) FILTER (WHERE credit = 0.0), '{}') AS missing_ids,
                       SUM(weight * credit) AS earned_weight,
                       SUM(weight) AS possible_weight
                FROM per_player
                GROUP BY listing_id
                """.formatted(wanted, PER_PLAYER.formatted("listing.listing_id IN (" + placeholders + ")"));
        Map<UUID, MatchHit> result = new LinkedHashMap<>();
        jdbc.query(sql, (rs, row) -> mapHit(rs), args.toArray())
                .forEach(hit -> result.put(hit.listingId(), hit));
        return result;
    }

    /** VALUES qatorlari (efhub_id, player_id, weight) — FeedRanker ham ishlatadi. */
    public static String wanted(List<Criterion> criteria, List<Object> args) {
        for (Criterion criterion : criteria) {
            args.add(criterion.efhubId());
            args.add(criterion.playerId().toString());
            args.add(criterion.weight());
        }
        return criteria.stream()
                .map(criterion -> "(?::bigint, ?::uuid, ?::numeric)")
                .collect(Collectors.joining(", "));
    }

    private static MatchHit mapHit(ResultSet rs) throws SQLException {
        return new MatchHit(
                rs.getObject("listing_id", UUID.class),
                rs.getBigDecimal("score"),
                rs.getInt("exact_count"),
                rs.getInt("alternate_count"),
                rs.getInt("missing_count"),
                longs(rs.getArray("exact_ids")),
                longs(rs.getArray("alternate_ids")),
                longs(rs.getArray("missing_ids")),
                rs.getBigDecimal("earned_weight"),
                rs.getBigDecimal("possible_weight"));
    }

    private static List<Long> longs(Array array) throws SQLException {
        if (array == null) return List.of();
        Object raw = array.getArray();
        if (raw instanceof Long[] values) return List.of(values);
        if (raw instanceof Number[] values) return Arrays.stream(values).map(Number::longValue).toList();
        return List.of();
    }
}
