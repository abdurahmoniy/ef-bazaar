package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.dto.MatchCardCriterion;
import uz.efbazaar.marketplace.dto.MatchRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Bounded compatibility adapter for links made before the typed matcher existed. */
@Component
@RequiredArgsConstructor
public class LegacyDreamTeamAdapter {

    private static final int MAX_CARDS = 11;

    private final ObjectMapper mapper;
    private final CardIdentityVerifier identities;

    public Optional<MatchRequest> parse(String rawJson, String rawMinimumPercent) {
        if (rawJson == null || rawJson.isBlank()) {
            return Optional.empty();
        }
        JsonNode root;
        try {
            root = mapper.readTree(rawJson);
        } catch (Exception exception) {
            throw invalid("dream_team JSON noto'g'ri");
        }
        if (!root.isArray() || root.isEmpty() || root.size() > MAX_CARDS) {
            throw invalid("dream_team 1 dan 11 tagacha karta massivi bo'lishi kerak");
        }

        List<Long> efhubIds = new ArrayList<>(root.size());
        List<MatchCardCriterion.Importance> importance = new ArrayList<>(root.size());
        for (JsonNode item : root) {
            if (!item.isObject()) {
                throw invalid("dream_team elementlari obyekt bo'lishi kerak");
            }
            efhubIds.add(readId(item.get("id")));
            int weight = item.has("w") ? readWeight(item.get("w")) : 1;
            importance.add(weight == 3
                    ? MatchCardCriterion.Importance.PRIORITY
                    : MatchCardCriterion.Importance.NORMAL);
        }

        Map<Long, UUID> resolved = identities.resolvePlayerIds(efhubIds);
        List<MatchCardCriterion> criteria = new ArrayList<>(efhubIds.size());
        Set<UUID> seenPlayers = new HashSet<>();
        for (int i = 0; i < efhubIds.size(); i++) {
            long efhubId = efhubIds.get(i);
            UUID playerId = resolved.get(efhubId);
            if (playerId == null) {
                throw invalid("noma'lum card: " + efhubId);
            }
            if (!seenPlayers.add(playerId)) {
                throw invalid("bir o'yinchi takror tanlangan");
            }
            criteria.add(new MatchCardCriterion(efhubId, playerId, importance.get(i)));
        }
        return Optional.of(new MatchRequest(criteria, strictness(rawMinimumPercent)));
    }

    private static long readId(JsonNode node) {
        if (node == null) throw invalid("card id kerak");
        try {
            long value;
            if (node.isIntegralNumber()) {
                value = node.longValue();
            } else if (node.isTextual() && node.textValue().matches("[0-9]+")) {
                value = Long.parseLong(node.textValue());
            } else {
                throw invalid("card id musbat butun son bo'lishi kerak");
            }
            if (value <= 0) throw invalid("card id musbat bo'lishi kerak");
            return value;
        } catch (NumberFormatException exception) {
            throw invalid("card id juda katta");
        }
    }

    private static int readWeight(JsonNode node) {
        if (!node.isIntegralNumber() || (node.intValue() != 1 && node.intValue() != 3)) {
            throw invalid("vazn faqat 1 yoki 3 bo'lishi mumkin");
        }
        return node.intValue();
    }

    private static int strictness(String rawMinimumPercent) {
        if (rawMinimumPercent == null || rawMinimumPercent.isBlank()) return 4;
        final int percent;
        try {
            percent = Integer.parseInt(rawMinimumPercent);
        } catch (NumberFormatException exception) {
            throw invalid("dream_team_min_match butun son bo'lishi kerak");
        }
        if (percent < 0 || percent > 100) {
            throw invalid("dream_team_min_match 0 dan 100 gacha bo'lishi kerak");
        }
        if (percent == 0) return 1;
        return Math.max(2, (int) Math.ceil(percent / 10.0));
    }

    private static MarketplaceException invalid(String reason) {
        return MarketplaceException.invalidAttributeValue("dream_team", reason);
    }
}
