package uz.efbazaar.recommendation.dreamteam;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Entity ↔ V1 sxema (ddl validate), JSONB slotlar va "bitta foydalanuvchiga bitta jamoa". */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import({DreamTeamService.class, DreamTeamWriteLock.class, CardIdentityVerifier.class})
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=validate")
class DreamTeamPersistenceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID PLAYER = UUID.randomUUID();

    @Autowired DreamTeamService service;
    @Autowired DreamTeamRepository repository;
    @Autowired JdbcTemplate jdbc;

    private static DreamTeamRequest withGoalkeeper(String formation) {
        return new DreamTeamRequest("ignored", formation, List.of(Map.of(
                "index", 0, "w", 3,
                "card", Map.of("efhubId", 891, "playerId", PLAYER.toString(), "name", "Keeper"))));
    }

    @Test
    void saveMineTwiceKeepsOneRow() {
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (891, ?, 1)", PLAYER);
        UUID user = UUID.randomUUID();

        service.saveMine(user, withGoalkeeper("4-3-3"));
        service.saveMine(user, new DreamTeamRequest("ignored", "4-2-3-1", List.of()));
        repository.flush();

        assertThat(jdbc.queryForObject("SELECT count(*) FROM dream_teams WHERE user_id = ?", Integer.class, user))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT formation FROM dream_teams WHERE user_id = ?", String.class, user))
                .isEqualTo("4-2-3-1");
    }

    @Test
    void slotsRoundTripThroughJsonb() {
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (891, ?, 1)", PLAYER);
        UUID user = UUID.randomUUID();
        service.saveMine(user, withGoalkeeper("4-3-3"));
        repository.flush();

        assertThat(jdbc.queryForObject(
                "SELECT slots -> 0 -> 'card' ->> 'playerId' FROM dream_teams WHERE user_id = ?", String.class, user))
                .isEqualTo(PLAYER.toString());
        assertThat(jdbc.queryForObject(
                "SELECT (slots -> 0 ->> 'w')::int FROM dream_teams WHERE user_id = ?", Integer.class, user))
                .isEqualTo(3);
        assertThat(jdbc.queryForObject(
                "SELECT slots -> 0 ->> 'position' FROM dream_teams WHERE user_id = ?", String.class, user))
                .isEqualTo("GK");
    }

    @Test
    void databaseRejectsSecondTeamForSameUser() {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO dream_teams (id, user_id, name) VALUES (?, ?, 'a')", UUID.randomUUID(), user);

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO dream_teams (id, user_id, name) VALUES (?, ?, 'b')", UUID.randomUUID(), user))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
