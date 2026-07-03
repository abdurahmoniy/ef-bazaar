package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Local mirror of marketplace's ChatCreated event shape. Consumed to enrich
 * with buyer/seller Telegram identity, then republished on the
 * {@code efbazaar.notifications.chat-created} topic for the bot.
 */
public record ChatCreatedDto(
        UUID chatId,
        UUID listingId,
        UUID buyerId,
        UUID sellerId,
        Instant occurredAt
) {}
