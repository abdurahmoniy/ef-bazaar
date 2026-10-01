package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

@Testcontainers(disabledWithoutDocker = true)
class ListingValueScorerIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final Instant NOW = Instant.parse("2026-10-01T12:00:00Z");

    private JdbcTemplate jdbc;
    private ListingValueScorer scorer;

    @BeforeEach
    void schema() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        // Bitta Postgres ikkala bazani ham o'ynaydi — testda jadvallar to'qnashmaydi.
        jdbc.execute("""
                CREATE TABLE listings (id UUID PRIMARY KEY, status VARCHAR(16) NOT NULL,
                    price NUMERIC(19,2) NOT NULL, value_score DOUBLE PRECISION);
                CREATE TABLE listing_cards (listing_id UUID NOT NULL, efhub_id BIGINT NOT NULL,
                    player_id UUID NOT NULL, ordinal SMALLINT NOT NULL);
                CREATE TABLE bigtime (efhub_id BIGINT PRIMARY KEY, overall_rating SMALLINT,
                    meta_tier TEXT NOT NULL DEFAULT 'NORMAL', meta_priority SMALLINT NOT NULL DEFAULT 0,
                    meta_active_from TIMESTAMPTZ, meta_active_until TIMESTAMPTZ);
                CREATE TABLE epic (LIKE bigtime INCLUDING ALL);
                CREATE TABLE showtime (LIKE bigtime INCLUDING ALL);
                CREATE TABLE card_player_identities (efhub_id BIGINT PRIMARY KEY, player_id UUID NOT NULL);
                """);
        ValueScoreCalculator calc = new ValueScoreCalculator(new ValueScoreProperties(
                80, 20, 2.0, 0.25, 15, new BigDecimal("5000"), new BigDecimal("50000000"), 0.5));
        scorer = new ListingValueScorer(jdbc, new CardCatalogReader(jdbc), calc,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private UUID listing(String price, long... efhubIds) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO listings (id, status, price) VALUES (?, 'ACTIVE', ?)", id, new BigDecimal(price));
        for (int i = 0; i < efhubIds.length; i++) {
            jdbc.update("INSERT INTO listing_cards VALUES (?, ?, ?, ?)", id, efhubIds[i], UUID.randomUUID(), i);
        }
        return id;
    }

    private Double score(UUID id) {
        return jdbc.queryForObject("SELECT value_score FROM listings WHERE id = ?", Double.class, id);
    }

    @Test
    void recomputeWritesFormulaResultFromCatalog() {
        jdbc.update("INSERT INTO bigtime (efhub_id, overall_rating) VALUES (8900000001, 100)");
        UUID id = listing("500000", 8900000001L);

        assertThat(scorer.recompute(List.of(id))).isEqualTo(1);

        // 0.5 × 0.5 (narx) + 0.5 × (1/15)
        assertThat(score(id)).isCloseTo(0.25 + 0.5 / 15, within(1e-9));
    }

    @Test
    void unchangedScoreIsNotRewritten() {
        UUID id = listing("500000");
        scorer.recompute(List.of(id));
        assertThat(scorer.recompute(List.of(id))).isZero();
    }

    @Test
    void cardChangeRecomputesOnlyListingsHoldingThatCard() {
        jdbc.update("INSERT INTO bigtime (efhub_id, overall_rating) VALUES (8900000001, 90)");
        UUID holder = listing("5000", 8900000001L);
        UUID other = listing("5000");
        scorer.recompute(List.of(holder, other));
        double before = score(holder);

        jdbc.update("UPDATE bigtime SET meta_tier = 'META', meta_priority = 4 WHERE efhub_id = 8900000001");
        assertThat(scorer.recomputeForCards(List.of(8900000001L))).isEqualTo(1);

        assertThat(score(holder)).isGreaterThan(before);
    }

    @Test
    void backfillFillsOnlyNullRowsInBatches() {
        UUID a = listing("500000");
        UUID b = listing("500000");
        UUID c = listing("500000");

        assertThat(scorer.backfillBatch(2)).isEqualTo(2);
        assertThat(scorer.backfillBatch(2)).isEqualTo(1);
        assertThat(scorer.backfillBatch(2)).isZero();
        assertThat(List.of(score(a), score(b), score(c))).allMatch(s -> s != null && s > 0);
    }

    @Test
    void cardMissingFromCatalogCountsAsZero() {
        UUID id = listing("5000", 8999999999L);
        scorer.recompute(List.of(id));
        assertThat(score(id)).isZero();
    }
}
