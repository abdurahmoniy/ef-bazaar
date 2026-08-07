package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import uz.efbazaar.trade.trade.domain.TradeMode;

import java.util.UUID;

/**
 * Sent by the proposer (either seller or buyer). Roles are decided at accept
 * time based on who owns the listing referenced by marketplaceChatId.
 *
 * <p>{@code cardId} is nullable: a HUMAN trade has no platform payment, so no
 * card is involved. SMART still requires both parties' cards, enforced in
 * {@code TradeService.openTrade}.
 *
 * <p>{@code mode}, {@code adminId} and {@code adminFeeUzs} may only be set by
 * the SELLER — see {@code TradeProposalService.create}.
 */
public record ProposalCreateRequest(
        @NotNull UUID marketplaceChatId,
        @NotNull UUID otherPartyUserId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        @NotNull @Min(1) Long amountUzs,
        UUID cardId,
        UUID listingId,
        /** {@code null} is treated as {@link TradeMode#SMART}. */
        TradeMode mode,
        /** Required when {@code mode == HUMAN}. */
        UUID adminId,
        /** Required when {@code mode == HUMAN}; must sit inside the admin's band. */
        @Min(1) Long adminFeeUzs
) {
    public TradeMode modeOrDefault() {
        return mode == null ? TradeMode.SMART : mode;
    }
}
