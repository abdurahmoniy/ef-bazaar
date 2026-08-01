package uz.efbazaar.marketplace.cards.sync;

import java.util.List;
import java.util.Map;

public record ScrapedCard(
        long efhubId,
        String name, String nameJa, String nameZh,
        String team, String league,
        String nationality, String nationalityCode,
        String position, String playingStyle,
        Integer overallRating, Integer maxOverallRating, int playerType,
        Integer age, Integer height, Integer weight,
        String preferredFoot,
        Integer weakFootUsage, Integer weakFootAccuracy,
        String imageUrl,
        Map<String, Integer> baseStats,
        List<String> skills, List<String> comSkills,
        String additionalPositionsJson,
        String rawJson
) {}
