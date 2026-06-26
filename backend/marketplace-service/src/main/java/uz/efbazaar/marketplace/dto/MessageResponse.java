package uz.efbazaar.marketplace.dto;

import java.time.Instant;
import java.util.UUID;

public record MessageResponse(
        UUID id,
        UUID chatId,
        UUID senderId,
        String content,
        Instant createdAt
) {}
