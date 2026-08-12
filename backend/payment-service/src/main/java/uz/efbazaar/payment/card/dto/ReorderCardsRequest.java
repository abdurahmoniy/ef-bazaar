package uz.efbazaar.payment.card.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.UUID;

public record ReorderCardsRequest(@NotEmpty List<UUID> orderedIds) {}
