package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirrors {@code UserPhotoSetEvent} published by the bot service. */
public record UserPhotoSetDto(
        UUID userId,
        Long telegramId,
        String photoFileId,
        /**
         * Telegram's stable identifier for the same source photo across reuploads.
         * Persisted so future login syncs can skip re-uploading an unchanged photo.
         */
        String photoFileUniqueId,
        Integer photoMessageId,
        Instant occurredAt
) {}
