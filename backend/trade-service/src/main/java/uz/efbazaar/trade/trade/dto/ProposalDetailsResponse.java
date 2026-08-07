package uz.efbazaar.trade.trade.dto;

import java.time.Instant;
import java.util.UUID;

import uz.efbazaar.trade.trade.domain.TradeMode;

/**
 * Snapshot of a pending proposal returned by
 * {@code GET /api/v1/trades/proposals?chatId=...}. Includes both party ids so
 * the client can render the "accept" affordance for the counterparty without
 * re-deriving roles.
 *
 * <p>Distinct from {@link ProposalResponse} — that DTO is the create-time
 * receipt (id + expiry) returned to the proposer. This one is the lookup
 * shape used by both sides after the fact.
 */
public record ProposalDetailsResponse(
        UUID proposalId,
        UUID marketplaceChatId,
        UUID sellerId,
        UUID buyerId,
        UUID proposerUserId,
        long amountUzs,
        UUID listingId,
        Instant expiresAt,
        /** SMART unless the seller hired a human admin. */
        TradeMode mode,
        UUID adminId,
        Long adminFeeUzs
) {}
