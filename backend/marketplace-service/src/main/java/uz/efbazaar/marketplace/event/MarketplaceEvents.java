package uz.efbazaar.marketplace.event;

import uz.efbazaar.marketplace.domain.ListingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Event payloads produced by marketplace-service.
 * Topic names: {@code efbazaar.marketplace.*}.
 */
public final class MarketplaceEvents {

    public static final String TOPIC_LISTING_CREATED = "efbazaar.marketplace.listing-created";
    public static final String TOPIC_LISTING_UPDATED = "efbazaar.marketplace.listing-updated";
    public static final String TOPIC_LISTING_DELETED = "efbazaar.marketplace.listing-deleted";
    public static final String TOPIC_LIKE_TOGGLED    = "efbazaar.marketplace.like-toggled";
    public static final String TOPIC_CHAT_CREATED    = "efbazaar.marketplace.chat-created";
    public static final String TOPIC_CHAT_EXPIRED    = "efbazaar.marketplace.chat-expired";

    private MarketplaceEvents() {}

    public record ListingCreated(
            UUID listingId, UUID sellerId, BigDecimal price,
            int highestDivisionLevel, List<String> valuablePlayers,
            Instant occurredAt) {}

    public record ListingUpdated(UUID listingId, UUID sellerId, Instant occurredAt) {}

    public record ListingDeleted(UUID listingId, UUID sellerId, ListingStatus newStatus,
                                 Instant occurredAt) {}

    public record LikeToggled(UUID listingId, UUID userId, boolean liked,
                              Instant occurredAt) {}

    public record ChatCreated(UUID chatId, UUID listingId, UUID buyerId, UUID sellerId,
                              Instant occurredAt) {}

    public record ChatExpired(UUID chatId, UUID listingId, UUID buyerId, UUID sellerId,
                              String reason, Instant occurredAt) {}
}
