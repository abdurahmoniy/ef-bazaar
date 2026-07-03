package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Local mirror of auth-service's {@code ChatNotificationEvent}. Consumed from
 * {@code efbazaar.notifications.chat-created} so the bot can DM the seller when
 * a buyer opens a chat.
 */
public record ChatNotificationDto(
        UUID chatId,
        UUID listingId,
        UUID buyerId,
        UUID sellerId,
        Long sellerTelegramId,
        String buyerDisplayName,
        String buyerTelegramUsername,
        Instant occurredAt
) {}
