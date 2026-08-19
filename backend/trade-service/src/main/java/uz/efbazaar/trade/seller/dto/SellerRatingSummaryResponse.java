package uz.efbazaar.trade.seller.dto;

import java.util.Map;
import java.util.UUID;

public record SellerRatingSummaryResponse(
        UUID sellerId,
        double averageRating,
        long ratingCount,
        long ratingSum,
        Map<Integer, Long> starCounts
) {
    public static SellerRatingSummaryResponse empty(UUID sellerId) {
        return new SellerRatingSummaryResponse(sellerId, 0.0, 0, 0,
                Map.of(5, 0L, 4, 0L, 3, 0L, 2, 0L, 1, 0L));
    }
}
