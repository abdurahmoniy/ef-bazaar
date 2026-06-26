package uz.efbazaar.marketplace.dto;

import java.math.BigDecimal;

/**
 * Listing browse filter — query parameter sifatida olinadi.
 * Hamma maydon optional.
 */
public record ListingFilter(
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Integer minDivision,
        Integer maxDivision,
        Integer minTeamStrength,
        Boolean hasGooglePlayLink,
        Boolean priceNegotiable,
        String valuablePlayer,    // single player name to match in valuable_players array
        String search             // full-text search in description (LIKE for MVP)
) {}
