package uz.efbazaar.recommendation.match;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.recommendation.exception.RecommendationException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Mijoz haqiqiy karta ID'siga to'qib chiqarilgan player ID'ni ulay olmasin. */
@Component
public class CardIdentityVerifier {

    public record Claim(long efhubId, UUID playerId) {
    }

    private final JdbcTemplate jdbc;

    public CardIdentityVerifier(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void verify(List<Claim> claims) {
        if (claims.isEmpty()) {
            return;
        }
        String values = claims.stream().map(claim -> "(?::bigint, ?::uuid)")
                .collect(Collectors.joining(", "));
        List<Object> args = new ArrayList<>(claims.size() * 2);
        for (Claim claim : claims) {
            args.add(claim.efhubId());
            args.add(claim.playerId().toString());
        }
        List<Long> invalid = jdbc.queryForList("""
                SELECT wanted.efhub_id
                FROM (VALUES %s) wanted(efhub_id, player_id)
                LEFT JOIN cards_view card
                  ON card.efhub_id = wanted.efhub_id
                 AND card.player_id = wanted.player_id
                WHERE card.efhub_id IS NULL
                """.formatted(values), Long.class, args.toArray());
        if (!invalid.isEmpty()) {
            throw RecommendationException.invalidAttributeValue("valuable_players",
                    "noma'lum yoki player_id mos kelmagan card: " + invalid.getFirst());
        }
    }

    /** Eski (faqat karta ID'li) tanlovni u tegishli o'yinchiga bog'laydi. */
    public Map<Long, UUID> resolvePlayerIds(List<Long> efhubIds) {
        if (efhubIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = efhubIds.stream().map(ignored -> "?").collect(Collectors.joining(", "));
        Map<Long, UUID> resolved = new LinkedHashMap<>();
        jdbc.query("""
                        SELECT efhub_id, player_id
                        FROM cards_view
                        WHERE efhub_id IN (%s)
                          AND player_id IS NOT NULL
                        """.formatted(placeholders),
                (rs, row) -> Map.entry(rs.getLong("efhub_id"), rs.getObject("player_id", UUID.class)),
                efhubIds.toArray()).forEach(entry -> resolved.put(entry.getKey(), entry.getValue()));
        return resolved;
    }
}
