package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Pins the scoring contract shared with the {@code card_match_score} SQL
 * function in V27. Both implementations must agree — this one only labels the
 * rows, but a drift would show users a percentage the ordering disagrees with.
 */
class CardMatchScorerTest {

    private final CardMatchScorer scorer = new CardMatchScorer(new ObjectMapper());

    private static Map<String, Object> listingWith(Map<String, Object>... cards) {
        return Map.of("valuable_players", List.of(cards));
    }

    private static Map<String, Object> card(long efhubId, String name) {
        return Map.of("efhub_id", efhubId, "name", name);
    }

    @Test
    void exactCardScoresFull() {
        Map<String, Object> attrs = listingWith(card(89123456789012L, "Lionel Messi"));
        String wanted = "[{\"id\":\"89123456789012\",\"name\":\"Lionel Messi\"}]";

        assertEquals(100, scorer.percent(attrs, wanted));
    }

    @Test
    void samePlayerDifferentCardScoresThreeQuarters() {
        // Seller has a different Messi card than the one asked for.
        Map<String, Object> attrs = listingWith(card(89999999999999L, "Lionel Messi"));
        String wanted = "[{\"id\":\"89123456789012\",\"name\":\"Lionel Messi\"}]";

        assertEquals(75, scorer.percent(attrs, wanted));
    }

    @Test
    void missingPlayerScoresZero() {
        Map<String, Object> attrs = listingWith(card(88111111111111L, "Kaka"));
        String wanted = "[{\"id\":\"89123456789012\",\"name\":\"Lionel Messi\"}]";

        assertEquals(0, scorer.percent(attrs, wanted));
    }

    @Test
    void weightsSkewTowardMustHaveSlots() {
        // Messi (weight 3) present, Ronaldo (weight 1) absent → 3/4 = 75%.
        Map<String, Object> attrs = listingWith(card(89123456789012L, "Lionel Messi"));
        String wanted = "["
                + "{\"id\":\"89123456789012\",\"name\":\"Lionel Messi\",\"w\":3},"
                + "{\"id\":\"89555555555555\",\"name\":\"Cristiano Ronaldo\",\"w\":1}]";

        assertEquals(75, scorer.percent(attrs, wanted));
    }

    @Test
    void halfTheSquadScoresHalf() {
        Map<String, Object> attrs = listingWith(
                card(89123456789012L, "Lionel Messi"),
                card(88222222222222L, "Zinedine Zidane"));
        String wanted = "["
                + "{\"id\":\"89123456789012\",\"name\":\"Lionel Messi\"},"
                + "{\"id\":\"88222222222222\",\"name\":\"Zinedine Zidane\"},"
                + "{\"id\":\"89555555555555\",\"name\":\"Cristiano Ronaldo\"},"
                + "{\"id\":\"88333333333333\",\"name\":\"Ronaldinho\"}]";

        assertEquals(50, scorer.percent(attrs, wanted));
    }

    @Test
    void nameMatchIsCaseInsensitive() {
        Map<String, Object> attrs = listingWith(card(89999999999999L, "LIONEL MESSI"));
        String wanted = "[{\"id\":\"89123456789012\",\"name\":\"lionel messi\"}]";

        assertEquals(75, scorer.percent(attrs, wanted));
    }

    @Test
    void legacyStringEntriesAreIgnoredNotFatal() {
        // Listings from before the CARD_LIST migration stored bare name strings.
        Map<String, Object> attrs = Map.of("valuable_players", List.of("Lionel Messi"));
        String wanted = "[{\"id\":\"89123456789012\",\"name\":\"Lionel Messi\"}]";

        assertEquals(0, scorer.percent(attrs, wanted));
    }

    @Test
    void noDreamTeamMeansNoPercentage() {
        Map<String, Object> attrs = listingWith(card(89123456789012L, "Lionel Messi"));

        assertNull(scorer.percent(attrs, null));
        assertNull(scorer.percent(attrs, ""));
        assertNull(scorer.percent(attrs, "[]"));
    }

    @Test
    void listingWithoutValuablePlayersScoresZero() {
        assertEquals(0, scorer.percent(Map.of(),
                "[{\"id\":\"89123456789012\",\"name\":\"Lionel Messi\"}]"));
    }

    @Test
    void malformedPayloadDoesNotBlowUp() {
        Map<String, Object> attrs = listingWith(card(89123456789012L, "Lionel Messi"));

        assertNull(scorer.percent(attrs, "{not json"));
    }
}
