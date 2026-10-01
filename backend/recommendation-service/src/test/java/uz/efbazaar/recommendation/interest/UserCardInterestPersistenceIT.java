package uz.efbazaar.recommendation.interest;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.maintenance.RetentionJob;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import({UserCardInterestRepository.class, RetentionJob.class})
class UserCardInterestPersistenceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired UserCardInterestRepository repository;
    @Autowired RetentionJob retention;
    @Autowired JdbcTemplate jdbc;

    @Test
    void touchUpsertsAndRefreshesLastAt() {
        UUID user = UUID.randomUUID();
        repository.touch(user, List.of(10L));
        jdbc.update("UPDATE user_card_interest SET last_at = now() - interval '10 days' WHERE user_id = ?", user);

        repository.touch(user, List.of(10L, 11L));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_card_interest WHERE user_id = ?",
                Integer.class, user)).isEqualTo(2);
        Instant lastAt = jdbc.queryForObject(
                "SELECT last_at FROM user_card_interest WHERE user_id = ? AND efhub_id = 10",
                java.sql.Timestamp.class, user).toInstant();
        assertThat(lastAt).isAfter(Instant.now().minusSeconds(60));
    }

    @Test
    void retentionDropsOnlyExpiredRows() {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 1, now() - interval '91 days')", user);
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 2, now() - interval '1 day')", user);
        jdbc.update("INSERT INTO consumed_events VALUES ('old', now() - interval '31 days')");
        jdbc.update("INSERT INTO consumed_events VALUES ('fresh', now())");

        retention.run();

        assertThat(jdbc.queryForList("SELECT efhub_id FROM user_card_interest WHERE user_id = ?", Long.class, user))
                .containsExactly(2L);
        assertThat(jdbc.queryForList("SELECT idempotency_key FROM consumed_events", String.class))
                .containsExactly("fresh");
    }
}
