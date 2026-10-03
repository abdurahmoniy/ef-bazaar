package uz.efbazaar.payment.observation;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The idempotency pre-check ({@code WHERE userbot_telegram_id ... AND
 * telegram_message_id = ?}) runs inside every deposit's transaction. The unique
 * index serves it as a point lookup only if {@code telegram_message_id} is its
 * LEADING column: with the COALESCE expression first, Postgres still "uses" the
 * index but walks all of it, so every top-up costs a scan that grows with the
 * table. EXPLAIN on a near-empty test table cannot tell the two apart, hence
 * the check on the index definition itself.
 */
@SpringBootTest
class ObservationIdempotencyIndexIT extends AbstractPostgresIT {

    @Autowired JdbcTemplate jdbc;

    @ParameterizedTest
    @ValueSource(strings = {"card_credit_observations", "card_debit_observations"})
    void theUniqueKeyLeadsWithTheMessageId(String table) {
        List<String> leading = jdbc.queryForList("""
                SELECT pg_get_indexdef(i.indexrelid, 1, true)
                  FROM pg_index i
                 WHERE i.indrelid = ?::regclass AND i.indisunique AND NOT i.indisprimary
                """, String.class, table);

        assertThat(leading).containsExactly("telegram_message_id");
    }
}
