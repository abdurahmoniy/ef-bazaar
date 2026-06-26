package uz.efbazaar.marketplace.cards;

import java.util.List;

public record CardSearchResult(
        long efhubId,
        String name,
        String team,
        String position,
        String playingStyle,
        Integer overallRating,
        CardType cardType,
        String imageUrl,
        List<String> skills
) {}
