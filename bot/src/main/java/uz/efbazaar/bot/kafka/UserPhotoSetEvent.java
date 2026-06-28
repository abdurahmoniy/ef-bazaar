package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Published after the bot uploads a freshly-registered user's profile photo into
 * the media topic. Auth-service consumes this and stores the {@code fileId} so
 * its photo proxy endpoint can stream the image on demand.
 *
 * <p>{@code messageId} is the audit-trail message_id in the media topic — kept
 * around so a developer can locate the source photo from the database row.
 */
public record UserPhotoSetEvent(
        UUID userId,
        Long telegramId,
        String photoFileId,
        Integer photoMessageId,
        Instant occurredAt
) {}
