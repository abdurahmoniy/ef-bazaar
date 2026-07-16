package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Sent by the proposer (either seller or buyer). Roles are decided at
 * accept time based on who owns the listing referenced by
 * marketplaceChatId — trade-service asks marketplace-service or is told
 * by the client (MVP: client sends the pair; server verifies via Kafka
 * later. This is fine because the marketplace-side system message
 * already carries the accept button.)
 */
public record ProposalCreateRequest(
        @NotNull UUID marketplaceChatId,
        @NotNull UUID otherPartyUserId,
        @NotNull UUID sellerId,
        @NotNull UUID buyerId,
        @NotNull @Min(1) Long amountUzs,
        @NotNull UUID cardId,
        UUID listingId
) {}
