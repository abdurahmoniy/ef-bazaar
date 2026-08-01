package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/**
 * Java twin of the {@code card_match_score} SQL function, used only to put a
 * percentage on rows the database already selected and ordered.
 *
 * <p>The duplication is deliberate and worth naming: the SQL version has to
 * exist because filtering and ordering must happen inside the query, and this
 * version has to exist because the ORDER BY value never reaches the entity.
 * The two must agree — exact card 1.0, same player 0.75, weighted per slot. If
 * you change one, change the other, and keep
 * {@link uz.efbazaar.marketplace.service.CardMatchScorerTest} passing.
 */
@Slf4j
@Component
public class CardMatchScorer {

    private static final String VALUABLE_PLAYERS = "valuable_players";
    private static final BigDecimal EXACT = BigDecimal.ONE;
    private static final BigDecimal SAME_PLAYER = new BigDecimal("0.75");

    private final ObjectMapper mapper;

    public CardMatchScorer(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * @param attributes listing attributes holding {@code valuable_players}
     * @param wantedJson the same JSON array the filter passed to SQL
     * @return coverage 0..100, or null when there is nothing to match against
     */
    public Integer percent(Map<String, Object> attributes, String wantedJson) {
        if (wantedJson == null || wantedJson.isBlank()) return null;
        List<Card> owned = ownedCards(attributes);
        JsonNode wanted;
        try {
            wanted = mapper.readTree(wantedJson);
        } catch (Exception e) {
            log.debug("dream team payload unparseable: {}", e.toString());
            return null;
        }
        if (!wanted.isArray() || wanted.isEmpty()) return null;

        BigDecimal weighted = BigDecimal.ZERO;
        BigDecimal totalWeight = BigDecimal.ZERO;
        for (JsonNode slot : wanted) {
            if (!slot.isObject()) continue;
            BigDecimal weight = slot.hasNonNull("w")
                    ? BigDecimal.valueOf(slot.get("w").asDouble())
                    : BigDecimal.ONE;
            totalWeight = totalWeight.add(weight);
            weighted = weighted.add(weight.multiply(best(owned, slot)));
        }
        if (totalWeight.signum() == 0) return null;

        return weighted.multiply(BigDecimal.valueOf(100))
                .divide(totalWeight, 0, RoundingMode.HALF_UP)
                .intValue();
    }

    private static BigDecimal best(List<Card> owned, JsonNode slot) {
        String id = slot.hasNonNull("id") ? slot.get("id").asText() : null;
        String name = slot.hasNonNull("name") ? slot.get("name").asText() : null;
        if (id != null && owned.stream().anyMatch(c -> id.equals(c.id()))) {
            return EXACT;
        }
        if (name != null && owned.stream().anyMatch(c -> name.equalsIgnoreCase(c.name()))) {
            return SAME_PLAYER;
        }
        return BigDecimal.ZERO;
    }

    @SuppressWarnings("unchecked")
    private static List<Card> ownedCards(Map<String, Object> attributes) {
        if (attributes == null) return List.of();
        Object raw = attributes.get(VALUABLE_PLAYERS);
        if (!(raw instanceof List<?> list)) return List.of();
        return list.stream()
                .filter(Map.class::isInstance)
                .map(entry -> (Map<String, Object>) entry)
                .map(entry -> new Card(
                        entry.get("efhub_id") == null ? null : String.valueOf(entry.get("efhub_id")),
                        entry.get("name") == null ? null : String.valueOf(entry.get("name"))))
                .toList();
    }

    private record Card(String id, String name) {}
}
