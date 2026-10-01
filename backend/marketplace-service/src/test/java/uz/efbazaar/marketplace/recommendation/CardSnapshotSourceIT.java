package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardSnapshot;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class CardSnapshotSourceIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;

    @BeforeEach
    void schema() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE bigtime (efhub_id BIGINT PRIMARY KEY, overall_rating SMALLINT,
                    meta_tier TEXT NOT NULL DEFAULT 'NORMAL', meta_priority SMALLINT NOT NULL DEFAULT 0,
                    meta_active_from TIMESTAMPTZ, meta_active_until TIMESTAMPTZ);
                CREATE TABLE epic (LIKE bigtime INCLUDING ALL);
                CREATE TABLE showtime (LIKE bigtime INCLUDING ALL);
                CREATE TABLE card_player_identities (efhub_id BIGINT PRIMARY KEY, player_id UUID NOT NULL);
                """);
    }

    @Test
    void buildsCardSnapshotWithPlayerAndMeta() {
        UUID player = UUID.randomUUID();
        jdbc.update("INSERT INTO bigtime VALUES (8900000001, 95, 'META', 3, NULL, '2026-12-01T00:00:00Z')");
        jdbc.update("INSERT INTO card_player_identities VALUES (8900000001, ?)", player);

        CardSnapshot s = (CardSnapshot) new CardSnapshotSource(new CardCatalogReader(jdbc))
                .build("8900000001", 11).orElseThrow();

        assertThat(s.efhubId()).isEqualTo(8900000001L);
        assertThat(s.playerId()).isEqualTo(player);
        assertThat(s.type()).isEqualTo("bigtime");
        assertThat(s.overallRating()).isEqualTo(95);
        assertThat(s.metaTier()).isEqualTo("META");
        assertThat(s.metaPriority()).isEqualTo(3);
        assertThat(s.activeUntil()).isNotNull();
        assertThat(s.idempotencyKey()).isEqualTo("card:8900000001:11");
    }

    @Test
    void unknownOrNonNumericCardProducesNothing() {
        CardSnapshotSource source = new CardSnapshotSource(new CardCatalogReader(jdbc));
        assertThat(source.build("8900000999", 1)).isEmpty();
        assertThat(source.build("not-a-number", 1)).isEmpty();
    }
}
