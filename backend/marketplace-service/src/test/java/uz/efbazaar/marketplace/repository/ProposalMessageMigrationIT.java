package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class ProposalMessageMigrationIT {
    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void migrationPreservesLegacyMessagesAndSupportsResolutionsBeforeCreation() throws Exception {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("CREATE TABLE chat_messages (id UUID PRIMARY KEY, content TEXT, proposal_outcome VARCHAR(16))");
        UUID oldMessage = UUID.randomUUID();
        jdbc.update("INSERT INTO chat_messages VALUES (?, '5000', 'ACCEPTED')", oldMessage);
        jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/V67__proposal_message_details.sql")));
        var legacy = jdbc.queryForMap("SELECT * FROM chat_messages WHERE id = ?", oldMessage);
        assertThat(legacy.get("content")).isEqualTo("5000");
        assertThat(legacy.get("proposal_outcome")).isEqualTo("ACCEPTED");
        assertThat(legacy.get("proposal_trade_id")).isNull();
        assertThat(legacy.get("proposal_kind")).isNull();

        UUID proposal = UUID.randomUUID();
        UUID trade = UUID.randomUUID();
        // No message or listing FK may prevent saving an early resolution.
        jdbc.update("INSERT INTO proposal_message_resolutions VALUES (?, 'ACCEPTED', ?)", proposal, trade);
        assertThat(jdbc.queryForObject("SELECT trade_id FROM proposal_message_resolutions WHERE proposal_id = ?", UUID.class, proposal)).isEqualTo(trade);
    }
}
