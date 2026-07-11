package uz.efbazaar.marketplace.dto;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Listing browse filter — query parameter sifatida olinadi. Hamma maydon optional.
 *
 * <p>Typed columns filtered via dedicated fields (price, negotiable). Dynamic
 * gameplay fields go into {@code attributes} — equality-match by default, plus
 * numeric range bounds via {@code <key>.min} / {@code <key>.max} entries for
 * INT/DECIMAL attribute definitions.
 */
public record ListingFilter(
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Boolean priceNegotiable,
        String search,                       // full-text search in description (LIKE for MVP)
        /**
         * Attribute filters keyed by definition key. Plain keys are equality
         * matched, e.g. {@code {"exchange_mode": "BOTH"}}; keys suffixed with
         * {@code .min}/{@code .max} become numeric range bounds, e.g.
         * {@code {"team_strength.min": "2000"}}. Values are compared against
         * {@link uz.efbazaar.marketplace.domain.Listing#getAttributes()} via
         * {@code jsonb_extract_path_text}.
         */
        Map<String, Object> attributes
) {}
