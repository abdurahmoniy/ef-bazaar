package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.trade.domain.Trade;

import java.time.Instant;
import java.util.UUID;

/**
 * Platform-queue view of an escalated trade. Deliberately not the party-facing
 * {@code TradeResponse} — a platform admin deciding whether to reassign or
 * cancel needs exactly the fields {@code TradeResponse} omits: which admin
 * went quiet, why, and how long ago, alongside the agreed fee a reassignment
 * has to at least match.
 */
public record EscalatedTradeResponse(
        UUID id,
        UUID sellerId,
        UUID buyerId,
        long priceUzs,
        UUID assignedAdminId,
        Long adminFeeUzs,
        Instant escalatedAt,
        String escalationReason,
        Instant createdAt
) {
    public static EscalatedTradeResponse of(Trade t) {
        return new EscalatedTradeResponse(
                t.getId(), t.getSellerId(), t.getBuyerId(), t.getPriceUzs(),
                t.getAssignedAdminId(), t.getAdminFeeUzs(),
                t.getEscalatedAt(), t.getEscalationReason(), t.getCreatedAt());
    }
}
