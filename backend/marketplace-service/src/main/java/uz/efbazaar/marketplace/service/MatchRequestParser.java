package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.dto.MatchCardCriterion;
import uz.efbazaar.marketplace.dto.MatchRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class MatchRequestParser {

    public static final int DEFAULT_STRICTNESS = 4;
    private final CardIdentityVerifier identities;

    public Optional<MatchRequest> parse(List<String> rawCriteria, Integer rawStrictness) {
        if (rawCriteria == null || rawCriteria.isEmpty()) {
            return Optional.empty();
        }
        if (rawCriteria.size() > 11) {
            throw invalid("eng ko'pi bilan 11 ta player tanlash mumkin");
        }
        int strictness = rawStrictness == null ? DEFAULT_STRICTNESS : rawStrictness;
        if (strictness < 1 || strictness > 10) {
            throw invalid("matchStrictness 1 dan 10 gacha bo'lishi kerak");
        }

        List<MatchCardCriterion> criteria = new ArrayList<>(rawCriteria.size());
        List<CardIdentityVerifier.Claim> claims = new ArrayList<>(rawCriteria.size());
        Set<UUID> players = new HashSet<>();
        for (String raw : rawCriteria) {
            String[] parts = raw == null ? new String[0] : raw.split(":", -1);
            if (parts.length != 3) {
                throw invalid("matchCard formati efhubId:playerId:N|P");
            }
            try {
                long efhubId = Long.parseLong(parts[0]);
                UUID playerId = UUID.fromString(parts[1]);
                MatchCardCriterion.Importance importance = switch (parts[2]) {
                    case "N" -> MatchCardCriterion.Importance.NORMAL;
                    case "P" -> MatchCardCriterion.Importance.PRIORITY;
                    default -> throw invalid("importance N yoki P bo'lishi kerak");
                };
                if (efhubId <= 0) {
                    throw invalid("efhubId musbat bo'lishi kerak");
                }
                if (!players.add(playerId)) {
                    throw invalid("takrorlangan player_id: " + playerId);
                }
                criteria.add(new MatchCardCriterion(efhubId, playerId, importance));
                claims.add(new CardIdentityVerifier.Claim(efhubId, playerId));
            } catch (IllegalArgumentException e) {
                throw invalid("matchCard formati efhubId:playerId:N|P");
            }
        }
        identities.verify(claims);
        return Optional.of(new MatchRequest(criteria, strictness));
    }

    private static MarketplaceException invalid(String reason) {
        return MarketplaceException.invalidAttributeValue("matchCard", reason);
    }
}
