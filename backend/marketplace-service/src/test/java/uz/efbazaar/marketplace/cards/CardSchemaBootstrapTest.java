package uz.efbazaar.marketplace.cards;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CardSchemaBootstrapTest {

    @Test
    void creates_canonical_identity_tables_before_altering_card_tables() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(eq("SELECT to_regclass(?) IS NOT NULL"),
                eq(Boolean.class), any(String.class))).thenReturn(true);

        new CardSchemaBootstrap(jdbc, true).apply();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, org.mockito.Mockito.atLeastOnce()).execute(sql.capture());
        List<String> statements = sql.getAllValues();

        assertThat(statements).anyMatch(value -> value.contains("CREATE TABLE IF NOT EXISTS player_identities"));
        assertThat(statements).anyMatch(value -> value.contains("CREATE TABLE IF NOT EXISTS card_player_identities"));
        assertThat(statements).anyMatch(value -> value.contains("idx_card_player_identities_player"));
        assertThat(statements.indexOf(statements.stream()
                        .filter(value -> value.contains("CREATE TABLE IF NOT EXISTS player_identities"))
                        .findFirst().orElseThrow()))
                .isLessThan(statements.indexOf(statements.stream()
                        .filter(value -> value.startsWith("ALTER TABLE bigtime"))
                        .findFirst().orElseThrow()));
    }
}
