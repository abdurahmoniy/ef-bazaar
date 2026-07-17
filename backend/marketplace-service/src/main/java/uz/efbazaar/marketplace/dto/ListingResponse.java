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
        Instant createdAt,
        Instant updatedAt
) {}
