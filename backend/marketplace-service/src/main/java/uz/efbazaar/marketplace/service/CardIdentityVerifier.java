package uz.efbazaar.marketplace.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Verifies that a client cannot pair a real card ID with a fabricated player ID. */
@Component
public class CardIdentityVerifier {

    public record Claim(long efhubId, UUID playerId) {
    }

    private final JdbcTemplate jdbc;

    public CardIdentityVerifier(@Qualifier("efbazaarJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void verify(List<Claim> claims) {
        if (claims.isEmpty()) {
            return;
        }
        String values = claims.stream().map(claim -> "(?, ?::uuid)")
                .collect(Collectors.joining(", "));
        List<Object> args = new ArrayList<>(claims.size() * 2);
        for (Claim claim : claims) {
            args.add(claim.efhubId());
            args.add(claim.playerId().toString());
        }
        List<Long> invalid = jdbc.queryForList("""
                SELECT wanted.efhub_id
                FROM (VALUES %s) wanted(efhub_id, player_id)
                LEFT JOIN card_player_identities identity
                  ON identity.efhub_id = wanted.efhub_id
                 AND identity.player_id = wanted.player_id
                WHERE identity.efhub_id IS NULL
                """.formatted(values), Long.class, args.toArray());
        if (!invalid.isEmpty()) {
            throw MarketplaceException.invalidAttributeValue("valuable_players",
                    "noma'lum yoki player_id mos kelmagan card: " + invalid.getFirst());
        }
    }

    /** Resolve legacy card-only selections to the canonical player they represent. */
    public Map<Long, UUID> resolvePlayerIds(List<Long> efhubIds) {
        if (efhubIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = efhubIds.stream().map(ignored -> "?")
                .collect(Collectors.joining(", "));
        Map<Long, UUID> resolved = new LinkedHashMap<>();
        jdbc.query("""
                        SELECT efhub_id, player_id
                        FROM card_player_identities
                        WHERE efhub_id IN (%s)
                        """.formatted(placeholders),
                (resultSet, rowNumber) -> Map.entry(
                        resultSet.getLong("efhub_id"),
                        resultSet.getObject("player_id", UUID.class)),
                efhubIds.toArray()).forEach(entry -> resolved.put(entry.getKey(), entry.getValue()));
        return resolved;
    }
}
