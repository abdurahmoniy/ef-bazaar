package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class PushTokenRepositoryIT {
    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private PushTokenRepository tokens;
    @BeforeEach void setUp() throws Exception {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("DROP TABLE IF EXISTS notification_push_tokens");
        jdbc.execute(Files.readString(Path.of("src/main/resources/db/migration/V64__notification_push_tokens.sql")));
        tokens = new PushTokenRepository(jdbc);
    }
    @Test void multipleDevicesAreIdempotentAndSwitchingAccountTransfersOwnership() {
        UUID first = UUID.randomUUID(), second = UUID.randomUUID();
        tokens.register(first, "phone");
        tokens.register(first, "tablet");
        tokens.register(first, "phone");
        assertThat(tokens.findByUserId(first)).containsExactlyInAnyOrder("phone", "tablet");
        tokens.register(second, "phone");
        assertThat(tokens.findByUserId(first)).containsExactly("tablet");
        assertThat(tokens.findByUserId(second)).containsExactly("phone");
        tokens.remove(first, "phone");
        assertThat(tokens.findByUserId(second)).containsExactly("phone");
        tokens.remove(second, "phone");
        tokens.remove(second, "phone");
        assertThat(tokens.findByUserId(second)).isEmpty();
    }
}
