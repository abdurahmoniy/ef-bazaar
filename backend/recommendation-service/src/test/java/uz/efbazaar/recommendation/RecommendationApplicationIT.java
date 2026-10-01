package uz.efbazaar.recommendation;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Butun kontekst haqiqiy Postgres va Flyway ustida ko'tariladi — JPA {@code validate}
 * sxema bilan entity'lar mosligini ham shu yerda tekshiradi.
 */
@SpringBootTest
@Testcontainers
@TestPropertySource(properties = {
        "spring.kafka.listener.auto-startup=false",
        "app.logging.kafka-forward.enabled=false",
        "app.card-interest.hmac-secret=test-secret"
})
class RecommendationApplicationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired JdbcTemplate jdbc;
    @Autowired Environment env;

    @Test
    void migrationsCreateEveryTable() {
        assertThat(jdbc.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
                String.class))
                .contains("listings_view", "listing_cards_view", "cards_view", "user_likes",
                        "dream_teams", "user_card_interest", "consumed_events");
    }

    /** Eski servisdan qolgan baza jim "baseline" qilinmasin — Flyway yiqilib, ko'rinsin. */
    @Test
    void baselineOnMigrateStaysOff() {
        assertThat(env.getProperty("spring.flyway.baseline-on-migrate", Boolean.class, false)).isFalse();
    }
}
