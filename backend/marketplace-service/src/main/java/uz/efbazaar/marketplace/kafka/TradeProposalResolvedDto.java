package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeProposalResolvedDto(
        UUID proposalId,
        String outcome,      // ACCEPTED | REJECTED | EXPIRED
        Instant resolvedAt) {}
