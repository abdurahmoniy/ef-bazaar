package uz.efbazaar.marketplace.pricewatch;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class PriceWatchMigrationIT {
    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    JdbcTemplate jdbc;
    @BeforeEach void setup() {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        Flyway.configure().dataSource(ds).load().migrate();
        jdbc = new JdbcTemplate(ds);
    }
    @Test void priceHistoryIsWrittenAtomicallyAndIgnoresUnchangedPrices() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_name='watch_price_events'", Integer.class))
                .as("authoritative durable price transition queue exists").isEqualTo(1);
        UUID listing = listing();
        jdbc.update("UPDATE listings SET price=price WHERE id=?", listing);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM watch_price_events WHERE listing_id=?", Integer.class, listing)).isZero();
        jdbc.update("UPDATE listings SET price=90 WHERE id=?", listing);
        jdbc.update("UPDATE listings SET price=80 WHERE id=?", listing);
        assertThat(jdbc.queryForList("SELECT old_price::int AS old, new_price::int AS new FROM watch_price_events WHERE listing_id=? ORDER BY price_version", listing))
                .containsExactly(java.util.Map.of("old",100,"new",90), java.util.Map.of("old",90,"new",80));
        var tx = new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        tx.executeWithoutResult(status -> {jdbc.update("UPDATE listings SET price=70 WHERE id=?", listing); status.setRollbackOnly();});
        assertThat(jdbc.queryForObject("SELECT count(*) FROM watch_price_events WHERE listing_id=?", Integer.class, listing)).isEqualTo(2);
    }
    @Test void publicationMetadataUsesDatabaseMutationTimeAndOnlyChangesOnPublication() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_name='listings' AND column_name='publication_version'", Integer.class)).isEqualTo(1);
        UUID listing = listing();
        assertThat(jdbc.queryForObject("SELECT publication_version FROM listings WHERE id=?", Long.class, listing)).isEqualTo(1);
        Object at=jdbc.queryForObject("SELECT published_at FROM listings WHERE id=?", Object.class, listing);
        jdbc.update("UPDATE listings SET description='edit' WHERE id=?", listing);
        assertThat(jdbc.queryForObject("SELECT published_at FROM listings WHERE id=?", Object.class, listing)).isEqualTo(at);
        jdbc.update("UPDATE listings SET status='DELETED' WHERE id=?", listing);
        jdbc.update("UPDATE listings SET status='ACTIVE' WHERE id=?", listing);
        assertThat(jdbc.queryForObject("SELECT publication_version FROM listings WHERE id=?", Long.class, listing)).isEqualTo(2);
    }
    UUID listing() {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO listings(id,seller_id,description,price,status,created_at,updated_at) VALUES (?,?,'test',100,'ACTIVE',now(),now())", id, UUID.randomUUID());
        return id;
    }
}
