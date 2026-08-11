package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LedgerSchemaIT extends AbstractPostgresIT {

    @Autowired JdbcTemplate jdbc;

    @Test
    void walletBalancesCannotGoNegative() {
        jdbc.update("INSERT INTO wallet_accounts (user_id) VALUES (gen_random_uuid())");

        assertThatThrownBy(() -> jdbc.update(
                "UPDATE wallet_accounts SET available_tiyin = -1"))
                .hasMessageContaining("chk_wallet_non_negative");
    }

    @Test
    void aLedgerEntryCannotBeZero() {
        String txId = jdbc.queryForObject("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'DEPOSIT', 'schema-test-1')
                RETURNING id::text
                """, String.class);

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO ledger_entries (transaction_id, account, amount_tiyin)
                VALUES (?::uuid, 'PLATFORM_CARDS', 0)
                """, txId))
                .hasMessageContaining("chk_entry_non_zero");
    }

    @Test
    void theIdempotencyKeyIsUnique() {
        jdbc.update("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'DEPOSIT', 'schema-test-dup')
                """);

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'DEPOSIT', 'schema-test-dup')
                """))
                .hasMessageContaining("wallet_transactions_idempotency_key_key");
    }

    @Test
    void everyLedgerAccountNameIsAccepted() {
        String txId = jdbc.queryForObject("""
                INSERT INTO wallet_transactions (id, kind, idempotency_key)
                VALUES (gen_random_uuid(), 'ADJUSTMENT', 'schema-test-accounts')
                RETURNING id::text
                """, String.class);

        for (String account : new String[]{
                "PLATFORM_CARDS", "USER_AVAILABLE", "USER_HELD",
                "WITHDRAW_PENDING", "PLATFORM_REVENUE", "PLATFORM_FEES"}) {
            jdbc.update("""
                    INSERT INTO ledger_entries (transaction_id, account, amount_tiyin)
                    VALUES (?::uuid, ?, 1)
                    """, txId, account);
        }

        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE transaction_id = ?::uuid",
                Integer.class, txId);
        assertThat(count).isEqualTo(6);
    }
}
