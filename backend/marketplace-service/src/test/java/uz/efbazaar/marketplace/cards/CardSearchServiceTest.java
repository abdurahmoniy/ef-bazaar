package uz.efbazaar.marketplace.cards;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CardSearchServiceTest {

    @SuppressWarnings({"unchecked", "rawtypes"})
    @Test
    void every_catalogue_branch_returns_the_canonical_player_id() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CardColumns columns = mock(CardColumns.class);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        new CardSearchService(jdbc, columns).search("messi", List.of(), 20);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), any(Object[].class));
        assertThat(sql.getValue()).contains("card_player_identities");
        assertThat(count(sql.getValue(), "player_id")).isGreaterThanOrEqualTo(CardType.values().length);
    }

    private static int count(String value, String needle) {
        return value.split(needle, -1).length - 1;
    }
}
