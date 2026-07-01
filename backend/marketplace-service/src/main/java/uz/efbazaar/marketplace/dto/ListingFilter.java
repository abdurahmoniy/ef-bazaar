package uz.efbazaar.marketplace.dto;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Listing browse filter — query parameter sifatida olinadi. Hamma maydon optional.
 *
 * <p>Typed columns filtered via dedicated fields (price, negotiable). Dynamic
 * gameplay fields go into {@code attributes} — equality-match only for phase 1b
 * (numeric range filtering to be added when needed).
 */
public record ListingFilter(
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Boolean priceNegotiable,
        String search,                       // full-text search in description (LIKE for MVP)
        /**
         * Attribute equality filters keyed by definition key. E.g.
         * {@code {"highest_division_level": 7, "has_google_play_link": true}}.
         * Uses Postgres jsonb {@code @>} operator against {@link
         * uz.efbazaar.marketplace.domain.Listing#getAttributes()}.
         */
        Map<String, Object> attributes
) {}
