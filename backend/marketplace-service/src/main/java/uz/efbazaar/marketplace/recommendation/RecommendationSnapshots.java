package uz.efbazaar.marketplace.recommendation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Snapshot payload'lari — har biri entity'ning TO'LIQ hozirgi holati. Consumer oxirgi
 * version'ni saqlaydi va eskisini e'tiborsiz qoldiradi.
 */
public final class RecommendationSnapshots {

    private RecommendationSnapshots() {
    }

    public record CardRef(long efhubId, UUID playerId) {}

    public record ListingSnapshot(String idempotencyKey, UUID listingId, UUID sellerId, String status,
                                  BigDecimal price, Double valueScore, List<CardRef> cards,
                                  long version, Instant occurredAt, Instant publishedAt, Long publicationVersion) {
        public ListingSnapshot(String idempotencyKey, UUID listingId, UUID sellerId, String status,
                               BigDecimal price, Double valueScore, List<CardRef> cards,
                               long version, Instant occurredAt) {
            this(idempotencyKey, listingId, sellerId, status, price, valueScore, cards, version, occurredAt, null, null);
        }
    }

    public record LikeSnapshot(String idempotencyKey, UUID listingId, UUID userId, boolean liked,
                               long version, Instant occurredAt) {}

    public record CardSnapshot(String idempotencyKey, long efhubId, UUID playerId, String type,
                               Integer overallRating, String metaTier, int metaPriority,
                               Instant activeFrom, Instant activeUntil, long version, Instant occurredAt) {}
}
