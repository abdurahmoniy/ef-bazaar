package uz.efbazaar.trade.trade.dto;

import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
import java.util.UUID;

public record TradeResponse(
        UUID id,
        TradeState state,
        UUID sellerId,
        UUID buyerId,
        long priceUzs,
        UUID mailboxId,
        UUID chatId,
        Instant createdAt,
        Instant expiresAt,
        Instant stateDeadline,
        ParticipantRole role  // set by the controller based on the caller
) {}
