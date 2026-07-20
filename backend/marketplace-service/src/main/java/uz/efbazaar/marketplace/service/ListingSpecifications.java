package uz.efbazaar.marketplace.service;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.hibernate.query.criteria.JpaExpression;
import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingFilter;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * JPA Specification builder for listing browse.
 *
 * <p>Typed columns (status, price, priceNegotiable, description) use direct
 * property access. Dynamic filters on {@code attributes} JSONB use Postgres
 * {@code jsonb_extract_path_text} for equality-match — good enough for the
 * common filter cases in phase 1b.
 *
 * <p>Numeric attributes additionally support range filtering via the
 * {@code <key>.min} / {@code <key>.max} suffix convention (query params
 * {@code attr.team_strength.min=2000&attr.team_strength.max=4000}). The JSONB
 * text is cast to numeric, so the caller MUST pre-filter range keys to
 * attribute definitions of type INT/DECIMAL — casting arbitrary text aborts
 * the whole query. {@link ListingService#browse} does that sanitization.
 *
 * <p>Card-list attributes ({@code valuable_players}) are stored as an array
 * of card objects (see {@code AttributeType.CARD_LIST}). Two synthetic
 * filter keys pull a card out of that array without a full JSONB path
 * traversal:
 * <ul>
 *   <li>{@code attr.valuable_players_id} → substring match against the
 *       serialized array text for {@code "efhub_id": <id>}. Any listing
 *       whose valuable_players contains this card matches.</li>
 *   <li>{@code attr.valuable_players_name} → substring match for
 *       {@code "name": "<name>"}. Catches listings that have OTHER cards
 *       of the same player.</li>
 * </ul>
 * When both are present the listing matches if EITHER hits, and the exact
 * (efhub_id) matches are ordered ahead of name-only matches so the caller
 * sees "this exact card" first, then "same player, different card".
 */
public final class ListingSpecifications {

    static final String CARD_ID_KEY = "valuable_players_id";
    static final String CARD_NAME_KEY = "valuable_players_name";
    private static final String VALUABLE_PLAYERS = "valuable_players";

    static final String RANGE_MIN_SUFFIX = ".min";
    static final String RANGE_MAX_SUFFIX = ".max";

    private ListingSpecifications() {}

    /** True when the filter key uses the {@code <key>.min}/{@code <key>.max} range convention. */
    static boolean isRangeKey(String key) {
        return rangeBaseKey(key) != null;
    }

    /** Attribute key a range filter applies to, or {@code null} when {@code key} is not a range key. */
    static String rangeBaseKey(String key) {
        if (key.endsWith(RANGE_MIN_SUFFIX) || key.endsWith(RANGE_MAX_SUFFIX)) {
            String base = key.substring(0, key.length() - RANGE_MIN_SUFFIX.length());
            return base.isEmpty() ? null : base;
        }
        return null;
    }

    public static Specification<Listing> withFilter(ListingFilter f) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            // Browse default: ACTIVE + SOLD (DELETED is hidden). SOLD stays
            // visible so buyers can see historical entries — the ListingService
            // sorts ACTIVE first via a prepended Sort in Pageable so SOLD sinks
            // to the bottom of the results.
            ps.add(root.get("status").in(ListingStatus.ACTIVE, ListingStatus.SOLD));

            if (f.minPrice() != null) {
                ps.add(cb.greaterThanOrEqualTo(root.get("price"), f.minPrice()));
            }
            if (f.maxPrice() != null) {
                ps.add(cb.lessThanOrEqualTo(root.get("price"), f.maxPrice()));
            }
            if (f.priceNegotiable() != null) {
                ps.add(cb.equal(root.get("priceNegotiable"), f.priceNegotiable()));
            }
            if (f.search() != null && !f.search().isBlank()) {
                // Free-text search covers the description AND the serialized
                // valuable_players card array, so a player name like "ronaldo"
                // finds listings even when the seller never mentions the player
                // in the description. Substring match over the JSONB text is the
                // same approach the valuable_players_name filter uses.
                String pattern = "%" + f.search().toLowerCase() + "%";
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("description")), pattern),
                        cb.like(cb.lower(extractText(cb, root, VALUABLE_PLAYERS)), pattern)));
            }
            if (f.attributes() != null && !f.attributes().isEmpty()) {
                applyAttributeFilters(cb, query, root, ps, f.attributes());
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }

    private static void applyAttributeFilters(CriteriaBuilder cb,
                                              jakarta.persistence.criteria.CommonAbstractCriteria query,
                                              Root<Listing> root,
                                              List<Predicate> ps,
                                              Map<String, Object> attributes) {
        Long cardId = readLong(attributes.get(CARD_ID_KEY));
        String cardName = readString(attributes.get(CARD_NAME_KEY));

        if (cardId != null || cardName != null) {
            Expression<String> playersText = extractText(cb, root, VALUABLE_PLAYERS);
            List<Predicate> cardMatch = new ArrayList<>(2);
            if (cardId != null) {
                cardMatch.add(cb.like(playersText, "%\"efhub_id\": " + cardId + "%"));
            }
            if (cardName != null) {
                cardMatch.add(cb.like(playersText,
                        "%\"name\": \"" + escapeLike(cardName) + "\"%"));
            }
            ps.add(cb.or(cardMatch.toArray(Predicate[]::new)));

            // Priority sort: exact card (efhub_id) match ahead of same-name
            // matches. Applied only when the caller supplied an id; without an
            // id there's nothing "exact" to prefer.
            if (cardId != null && query instanceof jakarta.persistence.criteria.CriteriaQuery<?> cq) {
                Expression<Integer> priority = cb.<Integer>selectCase()
                        .when(cb.like(playersText, "%\"efhub_id\": " + cardId + "%"), 0)
                        .otherwise(1).as(Integer.class);
                List<Order> orders = new ArrayList<>();
                orders.add(cb.asc(priority));
                orders.addAll(cq.getOrderList());
                cq.orderBy(orders);
            }
        }

        for (Map.Entry<String, Object> entry : attributes.entrySet()) {
            String key = entry.getKey();
            if (CARD_ID_KEY.equals(key) || CARD_NAME_KEY.equals(key)) continue;
            String base = rangeBaseKey(key);
            if (base != null) {
                BigDecimal bound = readDecimal(entry.getValue());
                if (bound == null) continue;
                Expression<BigDecimal> numeric = extractNumeric(cb, root, base);
                ps.add(key.endsWith(RANGE_MIN_SUFFIX)
                        ? cb.greaterThanOrEqualTo(numeric, bound)
                        : cb.lessThanOrEqualTo(numeric, bound));
                continue;
            }
            Expression<String> extracted = extractText(cb, root, key);
            ps.add(cb.equal(extracted, String.valueOf(entry.getValue())));
        }
    }

    private static Expression<String> extractText(CriteriaBuilder cb,
                                                  Root<Listing> root,
                                                  String key) {
        return cb.function(
                "jsonb_extract_path_text",
                String.class,
                root.get("attributes"),
                cb.literal(key));
    }

    /**
     * JSONB value cast to numeric for range comparisons. Missing attributes
     * extract as NULL and simply never match, which is the behaviour we want
     * for range filters.
     */
    @SuppressWarnings("unchecked")
    private static Expression<BigDecimal> extractNumeric(CriteriaBuilder cb,
                                                         Root<Listing> root,
                                                         String key) {
        Expression<String> text = extractText(cb, root, key);
        return ((HibernateCriteriaBuilder) cb).cast((JpaExpression<String>) text, BigDecimal.class);
    }

    private static BigDecimal readDecimal(Object raw) {
        if (raw == null) return null;
        if (raw instanceof BigDecimal d) return d;
        if (raw instanceof Number n) return new BigDecimal(n.toString());
        try {
            return new BigDecimal(String.valueOf(raw).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Long readLong(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String readString(Object raw) {
        if (raw == null) return null;
        String s = String.valueOf(raw).trim();
        return s.isEmpty() ? null : s;
    }

    private static String escapeLike(String s) {
        // Prevent user-supplied names from injecting LIKE wildcards.
        return s.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
                .replace("\"", "\\\"");
    }
}
