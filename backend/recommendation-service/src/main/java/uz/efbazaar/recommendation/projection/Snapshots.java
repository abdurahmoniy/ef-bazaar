package uz.efbazaar.recommendation.projection;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * marketplace {@code RecommendationSnapshots} bilan bir xil maydonlar. Klasslar ataylab
 * o'zimizniki — {@code __TypeId__} headeridagi marketplace klass nomiga bog'lanmaymiz.
 */
public final class Snapshots {

    private Snapshots() {
    }

    public record CardRef(long efhubId, UUID playerId) {}

    public record ListingSnapshot(String idempotencyKey, UUID listingId, UUID sellerId, String status,
                                  BigDecimal price, Double valueScore, List<CardRef> cards,
                                  long version, Instant occurredAt) {}

    public record LikeToggled(String idempotencyKey, UUID listingId, UUID userId, boolean liked,
                              long version, Instant occurredAt) {}

    public record CardSnapshot(String idempotencyKey, long efhubId, UUID playerId, String type,
                               Integer overallRating, String metaTier, int metaPriority,
                               Instant activeFrom, Instant activeUntil, long version, Instant occurredAt) {}
}
