package uz.efbazaar.trade.admin.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.presence.PresenceQuery;
import uz.efbazaar.trade.security.AuthSummaryClient;

import java.time.Instant;
import java.util.UUID;

/**
 * One card in the hire-an-admin list.
 *
 * <p>{@code @JsonInclude(NON_NULL)}: an unrated admin's {@code averageStars}
 * and {@code averageWorkSeconds} must be genuinely absent from the JSON, not
 * present as a literal {@code null} — a JSONPath filter over a missing
 * property yields an empty array, which is what the catalogue's "unrated"
 * tests assert against.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record TradeAdminCardResponse(
        UUID userId,
        String displayName,
        boolean photoAvailable,
        Double averageStars,
        int ratingCount,
        Long averageWorkSeconds,
        long minFeeUzs,
        long maxFeeUzs,
        boolean online,
        Instant lastSeenAt,
        int activeTrades,
        int maxConcurrentTrades,
        /** {@code activeTrades >= maxConcurrentTrades} — greyed out, not hidden. */
        boolean busy
) {
    public static TradeAdminCardResponse of(TradeAdminProfile p,
                                            AuthSummaryClient.UserSummary summary,
                                            PresenceQuery.Presence presence,
                                            int activeTrades) {
        return new TradeAdminCardResponse(
                p.getUserId(),
                summary == null ? null : summary.displayName(),
                summary != null && summary.photoAvailable(),
                p.averageStars(),
                p.getRatingCount(),
                p.averageWorkSeconds(),
                p.getMinFeeUzs(),
                p.getMaxFeeUzs(),
                presence != null && presence.online(),
                presence == null ? null : presence.lastSeenAt(),
                activeTrades,
                p.getMaxConcurrentTrades(),
                activeTrades >= p.getMaxConcurrentTrades());
    }
}
