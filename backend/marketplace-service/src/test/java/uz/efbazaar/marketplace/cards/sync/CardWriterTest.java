package uz.efbazaar.marketplace.cards.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.marketplace.cards.CardColumns;
import uz.efbazaar.marketplace.cards.CardType;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CardWriterTest {

    @Test
    void a_newly_scraped_card_gets_a_persisted_identity_mapping() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CardWriter writer = new CardWriter(jdbc, new ObjectMapper(), mock(CardColumns.class));
        ScrapedCard card = new ScrapedCard(
                89138556575063L, "  Ｌionel   MESSI ", null, null,
                "Argentina", null, "Argentina", "AR", "RWF", "Creative Playmaker",
                90, 106, 7, null, null, null, "Left", null, null, null,
                Map.of(), List.of(), List.of(), null, null);

        writer.upsert(card, CardType.BIGTIME);

        verify(jdbc).update(contains("INSERT INTO card_player_identities"),
                eq("Ｌionel MESSI"), eq("lionel messi"), eq(card.efhubId()));
    }
}
