package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class OutboxMigrationIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void createsOutboxTablesIdenticalToTheLibrarySchema() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/V71__outbox.sql")));

        assertThat(jdbc.queryForList("""
                SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'outbox_events' ORDER BY ordinal_position
                """, String.class))
                .containsExactly("id", "topic", "message_key", "payload", "headers", "created_at",
                        "published_at", "attempts", "last_error", "parked_at");
        assertThat(jdbc.queryForObject("SELECT nextval('outbox_snapshot_version_seq')", Long.class)).isEqualTo(1L);
        jdbc.update("INSERT INTO outbox_snapshot_pending (source, entity_id) VALUES ('listing', 'x')");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isEqualTo(1L);
    }
}
