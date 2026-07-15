package uz.efbazaar.trade.trade.dto;

import java.time.Instant;
import java.util.UUID;

public record ProposalResponse(UUID proposalId, Instant expiresAt) {}
