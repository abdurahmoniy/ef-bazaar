package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ProposalAcceptRequest(@NotNull UUID cardId) {}
