package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Published once per photo after the bot uploads a listing's media group into
 * the Telegram media topic on behalf of marketplace-service.
 *
 * <p>Contract mirrors CLAUDE.md: {@code { listingId, telegramMessageId, mediaType }}
 * with an {@code occurredAt} timestamp added for downstream ordering.
 * {@code listingId} is nullable so external callers that don't attach one still
 * produce an auditable event.
 */
public record MediaUploadedEvent(
        UUID listingId,
        Integer telegramMessageId,
        String mediaType,
        Instant occurredAt
) {}
