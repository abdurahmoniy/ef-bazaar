package uz.efbazaar.marketplace.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.ListingMatchHit;
import uz.efbazaar.marketplace.dto.MatchCardCriterion;
import uz.efbazaar.marketplace.dto.MatchRequest;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Optional;
import java.util.stream.Collectors;

@Repository
@RequiredArgsConstructor
public class JdbcListingMatchRepository implements ListingMatchRepository {

    private static final Map<String, String> SORT_COLUMNS = Map.of(
            "createdAt", "listing.created_at",
            "updatedAt", "listing.updated_at",
            "price", "listing.price",
            "likeCount", "(SELECT count(*) FROM listing_likes likes WHERE likes.listing_id = listing.id)");

    private final JdbcTemplate jdbc;

    @Override
    public Page<ListingMatchHit> findMatches(ListingFilter filter,
                                             MatchRequest request,
                                             Pageable pageable) {
        List<Object> args = new ArrayList<>();
        String cte = cte(filter, request, args);
        String scorePredicate = request.anyPositiveOverlap() ? "score > ?" : "score >= ?";
        args.add(request.minimumScore());

        Long total = jdbc.queryForObject(
                cte + " SELECT count(*) FROM scored WHERE " + scorePredicate,
                Long.class,
                args.toArray());
        if (total == null || total == 0) {
            return Page.empty(pageable);
        }

        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        String sql = cte + """
                SELECT scored.listing_id, scored.score, scored.exact_count,
                       scored.alternate_count, scored.missing_count,
                       scored.exact_ids, scored.alternate_ids, scored.missing_ids,
                       scored.earned_weight, scored.possible_weight
                FROM scored
                JOIN listings listing ON listing.id = scored.listing_id
                WHERE %s
                ORDER BY CASE listing.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
                         score DESC, %s, listing_id ASC
                LIMIT ? OFFSET ?
                """.formatted(scorePredicate, sort(pageable));
        List<ListingMatchHit> hits = jdbc.query(sql,
                JdbcListingMatchRepository::mapHit, pageArgs.toArray());
        return new PageImpl<>(hits, pageable, total);
    }

    @Override
    public Optional<ListingMatchHit> findMatch(UUID listingId, MatchRequest request) {
        List<Object> args = new ArrayList<>();
        String wantedRows = request.criteria().stream()
                .map(criterion -> "(?, ?::uuid, ?)")
                .collect(Collectors.joining(", "));
        for (MatchCardCriterion criterion : request.criteria()) {
            args.add(criterion.efhubId());
            args.add(criterion.playerId().toString());
            args.add(criterion.weight());
        }
        args.add(listingId);
        args.add(listingId);
        String sql = """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                per_player AS (
                    SELECT wanted.efhub_id, wanted.player_id, wanted.weight,
                           MAX(CASE
                               WHEN inventory.efhub_id = wanted.efhub_id THEN 1.0
                               WHEN inventory.player_id IS NOT NULL THEN 0.75
                               ELSE 0.0
                           END) AS credit
                    FROM wanted
                    LEFT JOIN listing_cards inventory
                      ON inventory.listing_id = ?
                     AND inventory.player_id = wanted.player_id
                    GROUP BY wanted.efhub_id, wanted.player_id, wanted.weight
                )
                SELECT ?::uuid AS listing_id,
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
                """.formatted(wantedRows);
        return jdbc.query(sql, JdbcListingMatchRepository::mapHit, args.toArray())
                .stream().findFirst();
    }

    private static ListingMatchHit mapHit(java.sql.ResultSet rs, int rowNum)
            throws java.sql.SQLException {
        return new ListingMatchHit(
                rs.getObject("listing_id", UUID.class),
                rs.getBigDecimal("score"),
                rs.getInt("exact_count"),
                rs.getInt("alternate_count"),
                rs.getInt("missing_count"),
                longArray(rs.getArray("exact_ids")),
                longArray(rs.getArray("alternate_ids")),
                longArray(rs.getArray("missing_ids")),
                rs.getBigDecimal("earned_weight"),
                rs.getBigDecimal("possible_weight"));
    }

    private static String cte(ListingFilter filter, MatchRequest request, List<Object> args) {
        String wantedRows = request.criteria().stream()
                .map(criterion -> "(?, ?::uuid, ?)")
                .collect(Collectors.joining(", "));
        for (MatchCardCriterion criterion : request.criteria()) {
            args.add(criterion.efhubId());
            args.add(criterion.playerId().toString());
            args.add(criterion.weight());
        }
        String baseWhere = baseWhere(filter, args);
        return """
                WITH wanted(efhub_id, player_id, weight) AS (VALUES %s),
                per_player AS (
                    SELECT listing.id AS listing_id,
                           wanted.efhub_id,
                           wanted.player_id,
                           wanted.weight,
                           MAX(CASE
                               WHEN inventory.efhub_id = wanted.efhub_id THEN 1.0
                               WHEN inventory.player_id IS NOT NULL THEN 0.75
                               ELSE 0.0
                           END) AS credit
                    FROM listings listing
                    CROSS JOIN wanted
                    LEFT JOIN listing_cards inventory
                      ON inventory.listing_id = listing.id
                     AND inventory.player_id = wanted.player_id
                    WHERE %s
                    GROUP BY listing.id, wanted.efhub_id, wanted.player_id, wanted.weight
                ),
                scored AS (
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
                )
                """.formatted(wantedRows, baseWhere);
    }

    private static String baseWhere(ListingFilter filter, List<Object> args) {
        List<String> predicates = new ArrayList<>();
        predicates.add("listing.status IN ('ACTIVE', 'SOLD')");
        if (filter.minPrice() != null) {
            predicates.add("listing.price >= ?");
            args.add(filter.minPrice());
        }
        if (filter.maxPrice() != null) {
            predicates.add("listing.price <= ?");
            args.add(filter.maxPrice());
        }
        if (filter.priceNegotiable() != null) {
            predicates.add("listing.is_price_negotiable = ?");
            args.add(filter.priceNegotiable());
        }
        if (filter.search() != null && !filter.search().isBlank()) {
            predicates.add("(lower(listing.description) LIKE ? OR lower(listing.attributes::text) LIKE ?)");
            String pattern = "%" + filter.search().strip().toLowerCase() + "%";
            args.add(pattern);
            args.add(pattern);
        }
        if (filter.attributes() != null) {
            for (Map.Entry<String, Object> entry : filter.attributes().entrySet()) {
                String key = entry.getKey();
                if ("dream_team".equals(key) || "dream_team_min_match".equals(key)) {
                    continue;
                }
                if (key.endsWith(".min") || key.endsWith(".max")) {
                    String base = key.substring(0, key.length() - 4);
                    predicates.add("CAST(NULLIF(jsonb_extract_path_text(listing.attributes, ?), '') AS numeric) "
                            + (key.endsWith(".min") ? ">= ?" : "<= ?"));
                    args.add(base);
                    args.add(new BigDecimal(String.valueOf(entry.getValue())));
                } else {
                    predicates.add("jsonb_extract_path_text(listing.attributes, ?) = ?");
                    args.add(key);
                    args.add(String.valueOf(entry.getValue()));
                }
            }
        }
        return String.join(" AND ", predicates);
    }

    private static String sort(Pageable pageable) {
        Sort.Order order = pageable.getSort().stream()
                .filter(candidate -> SORT_COLUMNS.containsKey(candidate.getProperty()))
                .findFirst()
                .orElse(Sort.Order.desc("createdAt"));
        return SORT_COLUMNS.get(order.getProperty()) + (order.isAscending() ? " ASC" : " DESC");
    }

    private static List<Long> longArray(java.sql.Array array) throws java.sql.SQLException {
        if (array == null) return List.of();
        Object raw = array.getArray();
        if (raw instanceof Long[] values) return List.of(values);
        if (raw instanceof Number[] values) {
            return java.util.Arrays.stream(values).map(Number::longValue).toList();
        }
        return List.of();
    }
}
