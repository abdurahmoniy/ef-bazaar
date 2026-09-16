package uz.efbazaar.marketplace.dto;

import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Saved account context for the anonymous admin transcript; never a chat message. */
public record AdminChatListingEventResponse(
        UUID id,
        UUID listingId,
        UUID requesterId,
        Instant createdAt,
        UUID afterMessageId,
        boolean initial,
        ListingSummary listing
) {
    /** Current listing details; the event timestamp records when it was selected. */
    public record ListingSummary(String description, BigDecimal price, String coverMessageId, ListingStatus status) {
        public static ListingSummary of(Listing listing) {
            if (listing == null) return null;
            var media = listing.getMediaMessageIds();
            return new ListingSummary(listing.getDescription(), listing.getPrice(),
                    media == null || media.isEmpty() ? null : media.getFirst(), listing.getStatus());
        }
    }
}
