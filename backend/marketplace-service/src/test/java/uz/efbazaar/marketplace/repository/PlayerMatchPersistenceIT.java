package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.ListingMatchHit;
import uz.efbazaar.marketplace.dto.MatchCardCriterion;
import uz.efbazaar.marketplace.dto.MatchRequest;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** PostgreSQL coverage for the SQL matcher and the singleton migration. */
@Testcontainers(disabledWithoutDocker = true)
class PlayerMatchPersistenceIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static DataSource dataSource;
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void connect() {
        dataSource = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(dataSource);
    }

    @BeforeEach
    void resetSchema() {
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
    }

    @Test
    void matcherFiltersAndOrdersExactAndAlternateCanonicalPlayerCards() {
        jdbc.execute("""
                CREATE TABLE listings (
                    id UUID PRIMARY KEY,
                    status VARCHAR(16) NOT NULL,
                    price NUMERIC(19,2) NOT NULL,
                    is_price_negotiable BOOLEAN NOT NULL,
                    description TEXT,
                    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );
                CREATE TABLE listing_cards (
                    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
                    efhub_id BIGINT NOT NULL,
                    player_id UUID NOT NULL,
                    ordinal SMALLINT NOT NULL,
                    snapshot JSONB NOT NULL,
                    PRIMARY KEY (listing_id, efhub_id),
                    UNIQUE (listing_id, player_id)
                );
                """);
        UUID playerId = UUID.randomUUID();
        UUID exact = listing("2026-08-11T03:00:00Z");
        UUID alternate = listing("2026-08-11T02:00:00Z");
        listing("2026-08-11T04:00:00Z");
        card(exact, 101L, playerId);
        card(alternate, 202L, playerId);

        JdbcListingMatchRepository repository = new JdbcListingMatchRepository(jdbc);
        MatchRequest request = new MatchRequest(List.of(new MatchCardCriterion(
                101L, playerId, MatchCardCriterion.Importance.NORMAL)), 7);
        Page<ListingMatchHit> matches = repository.findMatches(
                new ListingFilter(null, null, null, null, Map.of()),
                request,
                PageRequest.of(0, 20, Sort.by(Sort.Order.desc("createdAt"))));

        assertThat(matches.getTotalElements()).isEqualTo(2);
        assertThat(matches.getContent()).extracting(ListingMatchHit::listingId)
                .containsExactly(exact, alternate);
        assertThat(matches.getContent().get(0).score()).isEqualByComparingTo("1.0");
        assertThat(matches.getContent().get(1).score()).isEqualByComparingTo("0.75");

        Page<ListingMatchHit> strict = repository.findMatches(
                new ListingFilter(null, null, null, null, Map.of()),
                new MatchRequest(request.criteria(), 8),
                PageRequest.of(0, 20));
        assertThat(strict.getContent()).extracting(ListingMatchHit::listingId)
                .containsExactly(exact);
    }

    @Test
    void migrationKeepsLatestTeamAndEnforcesOneRowPerUser() throws Exception {
        jdbc.execute("""
                CREATE TABLE dream_teams (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL,
                    name VARCHAR(80) NOT NULL,
                    formation VARCHAR(16) NOT NULL,
                    slots JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX dream_teams_user_idx ON dream_teams (user_id, created_at DESC);
                """);
        UUID userId = UUID.randomUUID();
        UUID oldTeam = team(userId, "2026-08-10T01:00:00Z", "2026-08-10T02:00:00Z");
        UUID latestTeam = team(userId, "2026-08-09T01:00:00Z", "2026-08-11T02:00:00Z");
        UUID anotherUserTeam = team(UUID.randomUUID(), "2026-08-08T01:00:00Z", "2026-08-08T02:00:00Z");

        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V31__single_dream_team_per_user.sql"));
        }

        assertThat(jdbc.queryForList("SELECT id FROM dream_teams ORDER BY id", UUID.class))
                .containsExactlyInAnyOrder(latestTeam, anotherUserTeam)
                .doesNotContain(oldTeam);
        assertThatThrownBy(() -> team(userId, "2026-08-11T03:00:00Z", "2026-08-11T03:00:00Z"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private UUID listing(String createdAt) {
        UUID id = UUID.randomUUID();
        Timestamp timestamp = Timestamp.from(Instant.parse(createdAt));
        jdbc.update("""
                INSERT INTO listings
                    (id, status, price, is_price_negotiable, description, attributes, created_at, updated_at)
                VALUES (?, 'ACTIVE', 100000, false, '', '{}'::jsonb, ?, ?)
                """, id, timestamp, timestamp);
        return id;
    }

    private void card(UUID listingId, long efhubId, UUID playerId) {
        jdbc.update("""
                INSERT INTO listing_cards (listing_id, efhub_id, player_id, ordinal, snapshot)
                VALUES (?, ?, ?, 0, '{}'::jsonb)
                """, listingId, efhubId, playerId);
    }

    private UUID team(UUID userId, String createdAt, String updatedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO dream_teams
                    (id, user_id, name, formation, slots, created_at, updated_at)
                VALUES (?, ?, 'Mening jamoam', '4-3-3', '[]'::jsonb, ?, ?)
                """, id, userId, Timestamp.from(Instant.parse(createdAt)), Timestamp.from(Instant.parse(updatedAt)));
        return id;
    }
}
