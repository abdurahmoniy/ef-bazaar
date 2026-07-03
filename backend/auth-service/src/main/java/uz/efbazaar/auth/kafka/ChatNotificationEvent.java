package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Enriched chat notification produced by auth-service after resolving the raw
 * marketplace {@code chat-created} event against the users table. Published on
 * {@code efbazaar.notifications.chat-created}.
 *
 * <p>{@code sellerTelegramId} may be {@code null} when the seller signed up
 * via Google only — downstream consumers should skip DM delivery in that
 * case. {@code buyerDisplayName} is included so the DM can say who is
 * reaching out without an extra lookup.
 */
public record ChatNotificationEvent(
        UUID chatId,
        UUID listingId,
        UUID buyerId,
        UUID sellerId,
        Long sellerTelegramId,
        String buyerDisplayName,
        String buyerTelegramUsername,
        Instant occurredAt
) {}
