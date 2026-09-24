package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record ChatReadRequest(@NotNull UUID messageId) {}
