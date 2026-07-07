package uz.efbazaar.marketplace.cards.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerPageParserTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final PlayerPageParser parser = new PlayerPageParser(mapper);

    private static final String PLAYER_PAYLOAD =
            "\"player\":{\"id\":\"89123456\",\"name\":\"L. Messi\",\"team\":\"Inter Miami\"," +
            "\"position\":\"RWF\",\"overallRating\":94,\"playerType\":102," +
            "\"matchStats\":{\"apps\":30,\"goals\":25}," +
            "\"baseStats\":{\"offensiveAwareness\":95,\"ballControl\":96}," +
            "\"playerSkills\":[\"Sombrero\",\"Chip Shot Control\"]}";

    private String pushHtml(String decoded) throws Exception {
        return "<script>self.__next_f.push([0,\"chunk without player data\"])</script>"
                + "<script>self.__next_f.push([1," + mapper.writeValueAsString(decoded) + "])</script>";
    }

    @Test
    void parsesPlayerPayload() throws Exception {
        ScrapedCard card = parser.parse(pushHtml("{" + PLAYER_PAYLOAD + "}"), 1L);

        assertNotNull(card);
        assertEquals(89123456L, card.efhubId());
        assertEquals("L. Messi", card.name());
        assertEquals("Inter Miami", card.team());
        assertEquals(94, card.overallRating());
        assertEquals(102, card.playerType());
        assertEquals(95, card.baseStats().get("offensiveAwareness"));
        assertTrue(card.skills().contains("Sombrero"));
    }

    // Regression: a Next.js payload of hundreds of KB (with heavy quote escaping)
    // used to blow the stack in java.util.regex on the daily sync thread.
    @Test
    void parsesVeryLargePayloadWithoutStackOverflow() throws Exception {
        String padding = "{\"k\":\"value with \\\"escaped quotes\\\" inside\"},".repeat(20_000);
        String decoded = "{\"chunks\":[" + padding + "{}]," + PLAYER_PAYLOAD + "}";

        ScrapedCard card = parser.parse(pushHtml(decoded), 1L);

        assertNotNull(card);
        assertEquals(89123456L, card.efhubId());
        assertEquals("L. Messi", card.name());
        assertEquals(102, card.playerType());
    }

    @Test
    void returnsNullWhenNoPlayerData() throws Exception {
        assertNull(parser.parse(pushHtml("{\"page\":\"about\"}"), 1L));
        assertNull(parser.parse("<html>no push calls at all</html>", 1L));
    }
}
