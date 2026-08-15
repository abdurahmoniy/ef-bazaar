package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ListingResponse(
        UUID id,
        UUID sellerId,
        SellerSummary seller,
        String description,
        BigDecimal price,
        boolean priceNegotiable,
        /** Dynamic gameplay fields — see /api/v1/attributes for the schema. */
        Map<String, Object> attributes,
        List<String> mediaMessageIds,
        ListingStatus status,
        Instant soldAt,
        int forwardCount,
        long likeCount,
        Boolean likedByMe,
        /**
         * Squad coverage 0..100 against the dream team in the request, or null
         * when the caller didn't send one. Recomputed from
         * {@code valuable_players} for display — the SQL that filtered and
         * ordered the page never surfaces its score to the entity.
         */
        Integer matchPercent,
        /** One database-derived explanation; null for ordinary browse. */
        MatchDetails matchDetails,
        Instant createdAt,
        Instant updatedAt
) {
    /** Same listing with a match percentage attached. */
    public ListingResponse withMatchPercent(Integer percent) {
        return new ListingResponse(id, sellerId, seller, description, price, priceNegotiable,
                attributes, mediaMessageIds, status, soldAt, forwardCount, likeCount,
                likedByMe, percent, matchDetails, createdAt, updatedAt);
    }

    /** Attach the canonical explanation and mirror its percent for old clients. */
    public ListingResponse withMatchDetails(MatchDetails details) {
        return new ListingResponse(id, sellerId, seller, description, price, priceNegotiable,
                attributes, mediaMessageIds, status, soldAt, forwardCount, likeCount,
                likedByMe, details == null ? null : details.percent(), details,
                createdAt, updatedAt);
    }
}
