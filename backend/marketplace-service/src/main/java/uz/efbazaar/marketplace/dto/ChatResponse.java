package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.domain.ChatStatus;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ChatResponse(
        UUID id,
        UUID listingId,
        UUID buyerId,
        UUID sellerId,
        String buyerDisplayName,
        String sellerDisplayName,
        ChatStatus status,
        boolean important,
        Instant lastMessageAt,
        Instant createdAt,
        Instant closedAt,
        long messageCount,
        /** Viewer-specific: partner messages after my read cursor. */
        long unreadCount,
        /** Viewer-specific: my read cursor — drives the "new messages" divider. */
        Instant lastReadAt,
        /** One-line preview of the newest message (attachment → emoji label). */
        String lastMessagePreview
) {}
