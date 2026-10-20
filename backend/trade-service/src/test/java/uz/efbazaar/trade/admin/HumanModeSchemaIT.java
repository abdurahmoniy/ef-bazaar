package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the V9–V12 shape. A CHECK constraint that rejects a new enum value
 * fails at runtime with a constraint violation rather than at compile time,
 * so it needs a test.
 */
@SpringBootTest
class HumanModeSchemaIT extends AbstractIntegrationIT {

    @Autowired JdbcTemplate jdbc;

    @Test
    void tradesStateCheckAcceptsEveryEnumValue() {
        String def = constraintDef("chk_trades_state");
        for (TradeState s : TradeState.values()) {
            assertThat(def)
                    .as("TradeState.%s missing from chk_trades_state — every insert "
                        + "of that state will fail with a constraint violation", s.name())
                    .contains("'" + s.name() + "'");
        }
    }

    /**
     * Substring matching on the rendered constraint, not parsing it. Postgres
     * renders the CHECK as
     * {@code CHECK (((state)::text = ANY ((ARRAY['INITIATED'::character varying, ...])::text[])))},
     * so a quoted enum name appears verbatim exactly when it is permitted.
     */
    private String constraintDef(String name) {
        String def = jdbc.queryForObject("""
                SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = ?
                """, String.class, name);
        assertThat(def).as("constraint %s does not exist", name).isNotNull();
        return def;
    }

    @Test
    void auditActorCheckAcceptsTradeAdmin() {
        String def = jdbc.queryForObject("""
                SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = 'chk_audit_actor'
                """, String.class);
        assertThat(def).contains("TRADE_ADMIN");
    }

    @Test
    void messageSenderCheckAcceptsHumanAdmin() {
        String def = jdbc.queryForObject("""
                SELECT pg_get_constraintdef(oid) FROM pg_constraint
                 WHERE conname = 'chk_trade_messages_sender'
                """, String.class);
        assertThat(def).contains("HUMAN_ADMIN");
    }

    @Test
    void humanTradeMayHaveNoCards() {
        assertThat(isNullable("trades", "seller_card_id")).isTrue();
        assertThat(isNullable("trades", "buyer_card_id")).isTrue();
    }

    @Test
    void newTablesExist() {
        assertThat(tableExists("trade_admin_profiles")).isTrue();
        assertThat(tableExists("trade_steps")).isTrue();
        assertThat(tableExists("trade_admin_ratings")).isTrue();
    }

    private boolean isNullable(String table, String column) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT is_nullable = 'YES' FROM information_schema.columns
                 WHERE table_name = ? AND column_name = ?
                """, Boolean.class, table, column));
    }

    private boolean tableExists(String table) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM information_schema.tables
                                WHERE table_name = ?)
                """, Boolean.class, table));
    }
}
