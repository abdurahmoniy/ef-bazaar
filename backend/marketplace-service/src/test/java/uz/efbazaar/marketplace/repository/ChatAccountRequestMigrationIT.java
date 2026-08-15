package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The V32 guarantees, against a real PostgreSQL.
 *
 * <p>Runs the migration file itself rather than a copy of its DDL, so the test
 * fails if the shipped SQL stops saying what this asserts. The service-level
 * tests use {@code ddl-auto=create-drop}, which builds the schema from the
 * entity and therefore never creates the partial unique index — the one thing
 * standing between a chat and two contradictory answers to "which account are
 * we trading?".
 */
@Testcontainers(disabledWithoutDocker = true)
class ChatAccountRequestMigrationIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final Path V32 = Path.of(
            "src/main/resources/db/migration/V32__chat_account_requests.sql");

    private JdbcTemplate jdbc;
    private UUID chatId;
    private UUID listingA;
    private UUID listingB;
    private UUID buyer;

    @BeforeEach
    void applyMigration() throws Exception {
        DataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"");

        // Just enough of the parents for the foreign keys to bind.
        jdbc.execute("CREATE TABLE chats (id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE listings (id UUID PRIMARY KEY)");

        jdbc.execute(Files.readString(V32));

        chatId = UUID.randomUUID();
        listingA = UUID.randomUUID();
        listingB = UUID.randomUUID();
        buyer = UUID.randomUUID();
        jdbc.update("INSERT INTO chats (id) VALUES (?)", chatId);
        jdbc.update("INSERT INTO listings (id) VALUES (?), (?)", listingA, listingB);
    }

    private void insert(UUID listingId, String status, boolean closed) {
        jdbc.update("""
                INSERT INTO chat_account_requests
                    (chat_id, requester_id, listing_id, status, closed_at)
                VALUES (?, ?, ?, ?, ?)
                """, chatId, buyer, listingId, status, closed ? new java.sql.Timestamp(1) : null);
    }

    @Test
    void aChatCannotBeAboutTwoAccountsAtOnce() {
        insert(listingA, "OPEN", false);

        assertThatThrownBy(() -> insert(listingB, "OPEN", false))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void supersededRequestsStopBlockingTheNextOne() {
        insert(listingA, "OPEN", false);
        jdbc.update("UPDATE chat_account_requests SET status = 'CANCELLED', closed_at = NOW()");

        insert(listingB, "OPEN", false);

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM chat_account_requests WHERE status = 'OPEN'", Long.class))
                .as("exactly one live answer to 'which account'")
                .isEqualTo(1L);
    }

    @Test
    void historyIsKept() {
        insert(listingA, "FULFILLED", true);
        insert(listingB, "FULFILLED", true);

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM chat_account_requests", Long.class))
                .as("terminal rows are the record of what the pair traded")
                .isEqualTo(2L);
    }

    @Test
    void anOpenRequestCannotClaimToBeClosed() {
        assertThatThrownBy(() -> insert(listingA, "OPEN", true))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aClosedRequestMustSayWhen() {
        assertThatThrownBy(() -> insert(listingA, "CANCELLED", false))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletingTheChatTakesItsRequestsWithIt() {
        insert(listingA, "OPEN", false);

        jdbc.update("DELETE FROM chats WHERE id = ?", chatId);

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM chat_account_requests", Long.class)).isZero();
    }
}
