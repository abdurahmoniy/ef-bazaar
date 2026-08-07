package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.admin.domain.TradeAdminProfile;

import java.util.UUID;

/**
 * Full profile view — the admin's own settings page and the public profile
 * page use the same shape. Built by a static factory rather than MapStruct
 * because two of the fields are computed and one comes from auth-service.
 */
public record TradeAdminProfileResponse(
        UUID userId,
        String displayName,
        long minFeeUzs,
        long maxFeeUzs,
        String bio,
        boolean acceptingOrders,
        int maxConcurrentTrades,
        boolean active,
        /** {@code null} until somebody rates. */
        Double averageStars,
        int ratingCount,
        int completedCount,
        int abandonedCount,
        int cancelledCount,
        /** Mean seconds from accepting to pressing close; {@code null} before the first close. */
        Long averageWorkSeconds
) {
    public static TradeAdminProfileResponse of(TradeAdminProfile p, String displayName) {
        return new TradeAdminProfileResponse(
                p.getUserId(),
                displayName,
                p.getMinFeeUzs(),
                p.getMaxFeeUzs(),
                p.getBio(),
                p.isAcceptingOrders(),
                p.getMaxConcurrentTrades(),
                p.isActive(),
                p.averageStars(),
                p.getRatingCount(),
                p.getCompletedCount(),
                p.getAbandonedCount(),
                p.getCancelledCount(),
                p.averageWorkSeconds());
    }
}
