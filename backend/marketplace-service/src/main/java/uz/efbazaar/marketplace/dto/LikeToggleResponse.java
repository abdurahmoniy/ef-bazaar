package uz.efbazaar.marketplace.dto;

import java.util.UUID;

public record LikeToggleResponse(
        UUID listingId,
        boolean liked,
        long totalLikes
) {}
