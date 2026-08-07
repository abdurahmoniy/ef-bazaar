package uz.efbazaar.marketplace.cards;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
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

    @SuppressWarnings({"unchecked", "rawtypes"})
    @Test
    void searchRanksExactPrefixSubstringThenTrigramBeforeActiveMetaAndRating() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CardColumns columns = mock(CardColumns.class);
        when(columns.has(anyString(), anyString())).thenReturn(true);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        new CardSearchService(jdbc, columns).search("Messi", List.of(CardType.EPIC), 20);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), any(Object[].class));
        assertThat(sql.getValue())
                .contains("lower(trim(card.name)) = lower(trim(?))")
                .contains("lower(card.name) LIKE lower(?) || '%'")
                .contains("lower(card.name) LIKE '%' || lower(?) || '%'")
                .contains("similarity(card.name, ?) AS text_similarity")
                .contains("card.meta_active_from <= NOW()")
                .contains("card.meta_active_until > NOW()")
                .contains("ORDER BY text_rank, text_similarity DESC, active_meta DESC, meta_priority DESC")
                .contains("name, efhub_id");
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    @Test
    void metaBrowseFiltersByTheActiveWindowAndUsesPriorityOrdering() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CardColumns columns = mock(CardColumns.class);
        when(columns.has(anyString(), anyString())).thenReturn(true);
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(0L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        new CardSearchService(jdbc, columns).browse(null, List.of(CardType.BIGTIME),
                MetaTier.META, 0, 24);

        ArgumentCaptor<String> countSql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).queryForObject(countSql.capture(), eq(Long.class), any(Object[].class));
        assertThat(countSql.getValue())
                .contains("card.meta_tier = 'META'")
                .contains("card.meta_active_from IS NULL OR card.meta_active_from <= NOW()")
                .contains("card.meta_active_until IS NULL OR card.meta_active_until > NOW()");
        ArgumentCaptor<String> pageSql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, atLeastOnce()).query(pageSql.capture(), any(RowMapper.class), any(Object[].class));
        assertThat(pageSql.getValue()).contains("ORDER BY active_meta DESC, meta_priority DESC");
    }

    private static int count(String value, String needle) {
        return value.split(needle, -1).length - 1;
    }
}
