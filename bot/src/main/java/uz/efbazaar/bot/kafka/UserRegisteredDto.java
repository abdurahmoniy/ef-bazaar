package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirrors {@code AuthEvents.UserRegistered} and {@code AuthEvents.UserPhotoNeeded}
 * — same shape, reused so the photo uploader can subscribe to both topics.
 *
 * <p>{@code currentPhotoFileUniqueId} carries the user's most recently stored
 * Telegram {@code file_unique_id} (or {@code null} for a fresh register). The
 * bot compares it against the user's live Telegram photo and skips re-uploading
 * when they match.
 */
public record UserRegisteredDto(
        UUID userId,
        Long telegramId,
        String telegramUsername,
        String displayName,
        String currentPhotoFileUniqueId,
        Instant occurredAt
) {}
