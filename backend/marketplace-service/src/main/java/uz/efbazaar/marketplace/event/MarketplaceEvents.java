package uz.efbazaar.marketplace.event;

import uz.efbazaar.marketplace.domain.ListingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
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
    public static final String TOPIC_USER_BLACKLISTED   = "efbazaar.marketplace.user-blacklisted";
    public static final String TOPIC_USER_UNBLACKLISTED = "efbazaar.marketplace.user-unblacklisted";
    public static final String TOPIC_BOT_SETTINGS_UPDATED = "efbazaar.marketplace.bot-settings-updated";

    private MarketplaceEvents() {}

    public record ListingCreated(
            UUID listingId, UUID sellerId, BigDecimal price,
            Map<String, Object> attributes,
            Instant occurredAt) {}

    public record ListingUpdated(UUID listingId, UUID sellerId, Instant occurredAt) {}

    public record ListingDeleted(UUID listingId, UUID sellerId, ListingStatus newStatus,
                                 Instant occurredAt) {}

    public record LikeToggled(UUID listingId, UUID userId, boolean liked,
                              Instant occurredAt) {}

    public record ChatCreated(UUID chatId, UUID listingId, UUID buyerId, UUID sellerId,
                              Instant occurredAt) {}

    /**
     * Consumed by Chempionat-X (tournament join block) and trade-service.
     * {@code penaltyType} is TEMP_BLOCK or PERM_BLOCK; {@code expiresAt} null
     * means permanent. idempotencyKey = "bl-<penaltyId>".
     */
    public record UserBlacklisted(String idempotencyKey, UUID userId, String penaltyType,
                                  String reason, Instant expiresAt, Instant occurredAt) {}

    public record UserUnblacklisted(String idempotencyKey, UUID userId, String cause,
                                    Instant occurredAt) {}

    public record ChatExpired(UUID chatId, UUID listingId, UUID buyerId, UUID sellerId,
                              String reason, Instant occurredAt) {}

    /** Bot /start xabari yangilandi — signal, matnni o'zi emas. */
    public record BotSettingsUpdated(UUID updatedBy, Instant occurredAt) {}
}
