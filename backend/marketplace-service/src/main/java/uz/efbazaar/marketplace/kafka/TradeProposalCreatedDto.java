package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeProposalCreatedDto(
        UUID proposalId,
        UUID marketplaceChatId,
        UUID proposerUserId,
        long amountUzs,
        Instant createdAt,
        String kind,
        UUID listingId,
        Instant expiresAt) {}
