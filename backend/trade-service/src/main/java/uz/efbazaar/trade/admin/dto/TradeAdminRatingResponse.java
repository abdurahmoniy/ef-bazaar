package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.admin.domain.TradeAdminRating;
import uz.efbazaar.trade.trade.domain.ParticipantRole;

import java.time.Instant;
import java.util.UUID;

/**
 * A rating as shown on the public profile. The rater's identity is not
 * exposed — only which side of the trade they were on.
 */
public record TradeAdminRatingResponse(
        UUID id,
        short stars,
        /** {@code null} when a platform admin has hidden the text. */
        String comment,
        ParticipantRole raterRole,
        Instant createdAt
) {
    public static TradeAdminRatingResponse of(TradeAdminRating r) {
        return new TradeAdminRatingResponse(
                r.getId(),
                r.getStars(),
                r.isHidden() ? null : r.getComment(),
                r.getRaterRole(),
                r.getCreatedAt());
    }
}
