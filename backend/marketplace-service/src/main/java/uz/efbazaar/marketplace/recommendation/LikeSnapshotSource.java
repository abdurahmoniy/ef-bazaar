package uz.efbazaar.marketplace.recommendation;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.LikeSnapshot;
import uz.efbazaar.outbox.SnapshotSource;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** entityId = "<userId>:<listingId>"; liked — hozir listing_likes da qator bormi. Kalit — listingId. */
@Component
public class LikeSnapshotSource implements SnapshotSource {

    private final JdbcTemplate jdbc;

    public LikeSnapshotSource(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String source() {
        return RecommendationTopics.SOURCE_LIKE;
    }

    @Override
    public String topic() {
        return RecommendationTopics.LIKE_TOGGLED;
    }

    @Override
    public String key(String entityId) {
        int colon = entityId.indexOf(':');
        return colon < 0 ? entityId : entityId.substring(colon + 1);
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        String[] parts = entityId.split(":");
        if (parts.length != 2) {
            return Optional.empty();
        }
        UUID userId;
        UUID listingId;
        try {
            userId = UUID.fromString(parts[0]);
            listingId = UUID.fromString(parts[1]);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        Boolean liked = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM listing_likes WHERE user_id = ? AND listing_id = ?)",
                Boolean.class, userId, listingId);
        return Optional.of(new LikeSnapshot(RecommendationTopics.idempotencyKey(source(), entityId, version),
                listingId, userId, Boolean.TRUE.equals(liked), version, Instant.now()));
    }
}
