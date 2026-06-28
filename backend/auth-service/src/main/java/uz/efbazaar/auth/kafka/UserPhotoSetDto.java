package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirrors {@code UserPhotoSetEvent} published by the bot service. */
public record UserPhotoSetDto(
        UUID userId,
        Long telegramId,
        String photoFileId,
        Integer photoMessageId,
        Instant occurredAt
) {}
