package uz.efbazaar.marketplace.cards;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Admin catalogue row: public card data plus configured (not merely effective) META state. */
public record AdminCardSearchResult(
        long efhubId,
        UUID playerId,
        String name,
        String team,
        String position,
        String playingStyle,
        Integer overallRating,
        Integer maxOverallRating,
        CardType cardType,
        MetaTier metaTier,
        int metaPriority,
        String imageUrl,
        List<String> skills,
        MetaTier configuredMetaTier,
        int configuredMetaPriority,
        Instant metaActiveFrom,
        Instant metaActiveUntil,
        String metaReason,
        UUID metaUpdatedBy,
        Instant metaUpdatedAt,
        long interest7d,
        long interest30d
) {
    public AdminCardSearchResult withInterest(CardInterestService.Counts counts) {
        return new AdminCardSearchResult(efhubId, playerId, name, team, position, playingStyle,
                overallRating, maxOverallRating, cardType, metaTier, metaPriority, imageUrl, skills,
                configuredMetaTier, configuredMetaPriority, metaActiveFrom, metaActiveUntil,
                metaReason, metaUpdatedBy, metaUpdatedAt, counts.days7(), counts.days30());
    }
}
