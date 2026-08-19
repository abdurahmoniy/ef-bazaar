package uz.efbazaar.trade.seller.dto;

import uz.efbazaar.trade.seller.domain.SellerRating;

import java.time.Instant;
import java.util.UUID;

public record SellerRatingResponse(
        UUID id,
        UUID tradeId,
        UUID sellerId,
        UUID raterId,
        String raterDisplayName,
        String raterUsername,
        String raterPhotoUrl,
        short stars,
        String comment,
        boolean hidden,
        Instant createdAt
) {
    public static SellerRatingResponse of(SellerRating r, String displayName, String username, String photoUrl) {
        return new SellerRatingResponse(
                r.getId(),
                r.getTradeId(),
                r.getSellerId(),
                r.getRaterId(),
                displayName,
                username,
                photoUrl,
                r.getStars(),
                r.isHidden() ? null : r.getComment(),
                r.isHidden(),
                r.getCreatedAt());
    }

    public static SellerRatingResponse of(SellerRating r) {
        return of(r, null, null, null);
    }
}
