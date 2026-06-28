package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Published after the bot uploads (or confirms) a user's profile photo in the
 * media topic. Auth-service consumes this and persists the identifiers so its
 * /me/photo proxy can stream the image and future logins can dedupe via
 * {@code photoFileUniqueId}.
 */
public record UserPhotoSetEvent(
        UUID userId,
        Long telegramId,
        /** {@code file_id} returned by {@code sendPhoto} — used by getFile to download. */
        String photoFileId,
        /** Telegram's stable identifier for the source photo. Survives reuploads. */
        String photoFileUniqueId,
        /** Media-topic message_id for manual audit. */
        Integer photoMessageId,
        Instant occurredAt
) {}
