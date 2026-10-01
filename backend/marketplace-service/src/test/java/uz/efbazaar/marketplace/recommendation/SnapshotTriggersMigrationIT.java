package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class SnapshotTriggersMigrationIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;

    @BeforeEach
    void schema() throws Exception {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE listings (
                    id UUID PRIMARY KEY, seller_id UUID NOT NULL, status VARCHAR(16) NOT NULL,
                    price NUMERIC(19,2) NOT NULL, description TEXT);
                CREATE TABLE listing_cards (
                    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
                    efhub_id BIGINT NOT NULL, player_id UUID NOT NULL, ordinal SMALLINT NOT NULL,
                    snapshot JSONB NOT NULL, PRIMARY KEY (listing_id, efhub_id));
                CREATE TABLE listing_likes (
                    id UUID PRIMARY KEY, listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL, UNIQUE (listing_id, user_id));
                """);
        for (String f : List.of("V71__outbox.sql", "V72__listing_value_score.sql",
                "V73__recommendation_snapshot_triggers.sql")) {
            jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/" + f)));
        }
    }

    private List<String> marks(String source) {
        return jdbc.queryForList("SELECT entity_id FROM outbox_snapshot_pending WHERE source = ? ORDER BY entity_id",
                String.class, source);
    }

    private void clear() {
        jdbc.execute("TRUNCATE outbox_snapshot_pending");
    }

    private UUID listing(UUID seller) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO listings VALUES (?, ?, 'ACTIVE', 100000, 'd')", id, seller);
        return id;
    }

    @Test
    void insertAndRelevantUpdatesMarkTheListing() {
        UUID id = listing(UUID.randomUUID());
        assertThat(marks("listing")).containsExactly(id.toString());

        clear();
        jdbc.update("UPDATE listings SET description = 'only text' WHERE id = ?", id);
        assertThat(marks("listing")).isEmpty();

        for (String sql : List.of("UPDATE listings SET price = 200000 WHERE id = ?",
                "UPDATE listings SET status = 'SOLD' WHERE id = ?",
                "UPDATE listings SET value_score = 0.5 WHERE id = ?")) {
            clear();
            jdbc.update(sql, id);
            assertThat(marks("listing")).as(sql).containsExactly(id.toString());
        }
    }

    @Test
    void bulkStatusUpdateMarksEveryRow() {
        UUID seller = UUID.randomUUID();
        UUID a = listing(seller);
        UUID b = listing(seller);
        clear();

        // TrustService.retagBySellerAndStatus bilan bir xil shakl
        jdbc.update("UPDATE listings SET status = 'BLOCKED' WHERE seller_id = ? AND status = 'ACTIVE'", seller);

        assertThat(marks("listing")).containsExactlyInAnyOrder(a.toString(), b.toString());
    }

    @Test
    void cardInventoryChangesMarkTheListing() {
        UUID id = listing(UUID.randomUUID());
        clear();
        jdbc.update("INSERT INTO listing_cards VALUES (?, 89001, ?, 0, '{}')", id, UUID.randomUUID());
        assertThat(marks("listing")).containsExactly(id.toString());
        clear();
        jdbc.update("DELETE FROM listing_cards WHERE listing_id = ?", id);
        assertThat(marks("listing")).containsExactly(id.toString());
    }

    @Test
    void likeAndUnlikeMarkTheLikePair() {
        UUID id = listing(UUID.randomUUID());
        UUID user = UUID.randomUUID();
        clear();
        jdbc.update("INSERT INTO listing_likes VALUES (?, ?, ?)", UUID.randomUUID(), id, user);
        assertThat(marks("like")).containsExactly(user + ":" + id);
        clear();
        jdbc.update("DELETE FROM listing_likes WHERE listing_id = ? AND user_id = ?", id, user);
        assertThat(marks("like")).containsExactly(user + ":" + id);
    }

    @Test
    void rolledBackChangeLeavesNoMark() {
        tx.executeWithoutResult(s -> {
            listing(UUID.randomUUID());
            s.setRollbackOnly();
        });
        assertThat(marks("listing")).isEmpty();
    }

    @Test
    void repeatedChangeRefreshesMarkedAt() throws Exception {
        UUID id = listing(UUID.randomUUID());
        java.sql.Timestamp first = jdbc.queryForObject(
                "SELECT marked_at FROM outbox_snapshot_pending WHERE entity_id = ?", java.sql.Timestamp.class, id.toString());
        Thread.sleep(5);
        jdbc.update("UPDATE listings SET price = 300000 WHERE id = ?", id);
        java.sql.Timestamp second = jdbc.queryForObject(
                "SELECT marked_at FROM outbox_snapshot_pending WHERE entity_id = ?", java.sql.Timestamp.class, id.toString());
        assertThat(second).isAfter(first);
    }
}
