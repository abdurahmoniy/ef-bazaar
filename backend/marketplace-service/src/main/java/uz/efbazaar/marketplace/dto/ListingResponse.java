package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ListingResponse(
        UUID id,
        UUID sellerId,
        String description,
        List<String> valuablePlayers,
        boolean hasGooglePlayLink,
        int highestDivisionLevel,
        int androidCoins,
        int iosCoins,
        int teamStrength,
        BigDecimal price,
        boolean priceNegotiable,
        List<String> mediaMessageIds,
        ListingStatus status,
        int forwardCount,
        long likeCount,
        Boolean likedByMe,
        Instant createdAt,
        Instant updatedAt
) {}
