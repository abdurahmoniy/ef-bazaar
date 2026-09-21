package uz.efbazaar.marketplace.account;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Akkount tarkibi — listing_cards bilan bir xil qoidalar bo'yicha.
 *
 * <p>Kartani tashlab yuborish ATAYLAB jim: e'lon tomonida ham shunday,
 * va bitta buzuq karta butun akkountni saqlab bo'lmaydigan qilib
 * qo'yishi mumkin emas.
 */
class UserAccountCardInventoryTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final UserAccountCardInventory inventory =
            new UserAccountCardInventory(jdbc, new ObjectMapper());

    @Test
    void replace_clearsThenInsertsEveryValidCard() {
        UUID accountId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        List<Object> cards = List.of(
                Map.of("efhub_id", 1234, "player_id", playerId.toString(), "name", "Messi"),
                Map.of("name", "no ids at all"));

        inventory.replace(accountId, cards);

        verify(jdbc).update("DELETE FROM user_account_cards WHERE account_id = ?", accountId);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(jdbc).batchUpdate(anyString(), rows.capture());
        assertThat(rows.getValue()).hasSize(1);
        assertThat(rows.getValue().get(0)[0]).isEqualTo(accountId);
        assertThat(rows.getValue().get(0)[1]).isEqualTo(1234L);
        assertThat(rows.getValue().get(0)[2]).isEqualTo(playerId);
        assertThat(rows.getValue().get(0)[3]).isEqualTo(0);
    }

    @Test
    void replace_withNoCards_doesNotBatchInsert() {
        inventory.replace(UUID.randomUUID(), null);
        verify(jdbc, never()).batchUpdate(anyString(), any(List.class));
    }
}
