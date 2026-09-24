package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.NotNull;

public record ChatTypingRequest(@NotNull Boolean typing) {}
