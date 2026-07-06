package uz.efbazaar.marketplace.service;

import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingFilter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * JPA Specification builder for listing browse.
 *
 * <p>Typed columns (status, price, priceNegotiable, description) use direct
 * property access. Dynamic filters on {@code attributes} JSONB use Postgres
 * {@code jsonb_extract_path_text} for equality-match — good enough for the
 * common filter cases in phase 1b. Numeric range filters on dynamic attributes
 * will be added in a follow-up once the frontend needs them.
 */
public final class ListingSpecifications {

    /**
     * Attribute keys stored as comma-separated strings ("Cristiano Ronaldo,
     * Lionel Messi"). Filtering by one member needs substring match; equality
     * on the whole string almost never lands a hit. Everything else stays on
     * equality — booleans, ints, single-value enums.
     */
    private static final Set<String> LIST_LIKE_ATTRS = Set.of("valuable_players");

    private ListingSpecifications() {}

    public static Specification<Listing> withFilter(ListingFilter f) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            // Browse default: only ACTIVE
            ps.add(cb.equal(root.get("status"), ListingStatus.ACTIVE));

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
                ps.add(cb.like(cb.lower(root.get("description")),
                        "%" + f.search().toLowerCase() + "%"));
            }
            if (f.attributes() != null && !f.attributes().isEmpty()) {
                for (Map.Entry<String, Object> entry : f.attributes().entrySet()) {
                    Expression<String> extracted = cb.function(
                            "jsonb_extract_path_text",
                            String.class,
                            root.get("attributes"),
                            cb.literal(entry.getKey()));
                    String value = String.valueOf(entry.getValue());
                    if (LIST_LIKE_ATTRS.contains(entry.getKey())) {
                        ps.add(cb.like(cb.lower(extracted),
                                "%" + value.toLowerCase() + "%"));
                    } else {
                        ps.add(cb.equal(extracted, value));
                    }
                }
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }
}
