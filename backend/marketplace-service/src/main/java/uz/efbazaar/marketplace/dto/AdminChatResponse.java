package uz.efbazaar.marketplace.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A conversation as the admin chat viewer shows it. Unlike {@link ChatResponse}
 * it carries nothing viewer-specific (star, read cursor, unread count): the
 * admin is not a participant and leaves no state behind.
 *
 * @param buyerName  "@username" when the party has one, otherwise the display
 *                   name; null when neither is known
 */
public record AdminChatResponse(
        UUID id,
        UUID listingId,
        UUID buyerId,
        UUID sellerId,
        String buyerName,
        String sellerName,
        Instant lastMessageAt,
        Instant createdAt,
        long messageCount,
        String lastMessagePreview
) {}
