package uz.efbazaar.marketplace.pricewatch;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class WatchMessages {
    private WatchMessages() {}
    public record Reason(UUID watchId,String label) {}
    public record Candidate(String idempotencyKey,UUID intentId,UUID userId,UUID listingId,
                            Long publicationVersion,Instant publishedAt,List<Reason> reasons,Instant occurredAt) {}
    public record AuthorizationRequest(UUID intentId,UUID userId,UUID listingId,long publicationVersion) {}
    public record Authorization(boolean eligible,List<Reason> reasons,String deliveryMode) {}
    public record TelegramRequest(UUID deliveryId,long chatId,String text) {}
    public record TelegramResponse(Long messageId) {}
}
