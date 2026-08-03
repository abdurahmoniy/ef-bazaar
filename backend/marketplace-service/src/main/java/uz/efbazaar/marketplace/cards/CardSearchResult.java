package uz.efbazaar.marketplace.cards;

import java.util.List;
import java.util.UUID;

/**
 * @param overallRating    level-1 rating as efhub reports it
 * @param maxOverallRating OVR at max level — the number players actually quote
 *                         ("Messi 106"). Null for cards scraped before the
 *                         field was captured; clients fall back to
 *                         {@code overallRating}.
 */
public record CardSearchResult(
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
        List<String> skills
) {}
