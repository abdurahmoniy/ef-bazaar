package uz.efbazaar.marketplace.recommendation;

import java.time.Instant;
import java.util.UUID;

/** efbazaar katalogidagi kartaning value_score va snapshot uchun kerakli ma'lumoti. */
public record CardFacts(long efhubId, String type, UUID playerId, Integer overallRating,
                        String metaTier, int metaPriority, Instant activeFrom, Instant activeUntil) {

    public boolean metaActiveAt(Instant now) {
        return "META".equals(metaTier)
                && (activeFrom == null || !activeFrom.isAfter(now))
                && (activeUntil == null || activeUntil.isAfter(now));
    }
}
