package uz.efbazaar.recommendation.watch;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import uz.efbazaar.recommendation.exception.RecommendationException;

public final class SavedSearchDtos {
    private SavedSearchDtos() {}
    public record Request(String name, List<String> matchCard, Integer matchStrictness,
                          BigDecimal minPrice, BigDecimal maxPrice, Boolean notificationsEnabled) {
        @JsonAnySetter public void unsupported(String key, Object value) {
            throw RecommendationException.badRequest("unsupported_search_criterion", "Qo'llab-quvvatlanmaydigan mezon: " + key);
        }
    }
    public record Patch(Boolean paused, Boolean notificationsEnabled) {
        @JsonAnySetter public void unsupported(String key, Object value) {
            throw RecommendationException.badRequest("unsupported_search_criterion", "Qo'llab-quvvatlanmaydigan maydon: " + key);
        }
    }
    public record Priorities(List<UUID> ids) {}
    public record Item(UUID id, String name, List<String> matchCard, int matchStrictness,
                       BigDecimal minPrice, BigDecimal maxPrice, boolean paused, String pauseReason,
                       int priority, boolean notificationsEnabled, Instant createdAt) {}
    public record Listing(List<Item> items, Integer limit, boolean immediate, boolean available) {}
    public record Reason(UUID watchId, String label) {}
    public record Candidate(String idempotencyKey, UUID intentId, UUID userId, UUID listingId,
                            long publicationVersion, Instant publishedAt, List<Reason> reasons, Instant occurredAt) {}
    public record AuthorizationRequest(UUID intentId, UUID userId, UUID listingId, long publicationVersion) {}
    public record Authorization(boolean eligible, List<Reason> reasons, String deliveryMode) {}
}
