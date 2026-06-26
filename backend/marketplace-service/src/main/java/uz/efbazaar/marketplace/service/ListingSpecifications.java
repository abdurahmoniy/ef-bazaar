package uz.efbazaar.marketplace.service;

import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingFilter;

import java.util.ArrayList;
import java.util.List;

/**
 * JPA Specification builder for listing browse filters.
 * Note: Postgres TEXT[] member-check uses native function {@code array_position}.
 */
public final class ListingSpecifications {

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
            if (f.minDivision() != null) {
                ps.add(cb.greaterThanOrEqualTo(root.get("highestDivisionLevel"), f.minDivision()));
            }
            if (f.maxDivision() != null) {
                ps.add(cb.lessThanOrEqualTo(root.get("highestDivisionLevel"), f.maxDivision()));
            }
            if (f.minTeamStrength() != null) {
                ps.add(cb.greaterThanOrEqualTo(root.get("teamStrength"), f.minTeamStrength()));
            }
            if (f.hasGooglePlayLink() != null) {
                ps.add(cb.equal(root.get("hasGooglePlayLink"), f.hasGooglePlayLink()));
            }
            if (f.priceNegotiable() != null) {
                ps.add(cb.equal(root.get("isPriceNegotiable"), f.priceNegotiable()));
            }
            if (f.valuablePlayer() != null && !f.valuablePlayer().isBlank()) {
                // Postgres: 1 = ANY (array_positions(valuable_players, :player))
                // Simpler: use native function via cb
                Expression<Integer> pos = cb.function("array_position",
                        Integer.class,
                        root.get("valuablePlayers"),
                        cb.literal(f.valuablePlayer()));
                ps.add(cb.isNotNull(pos));
            }
            if (f.search() != null && !f.search().isBlank()) {
                ps.add(cb.like(cb.lower(root.get("description")),
                        "%" + f.search().toLowerCase() + "%"));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }
}
