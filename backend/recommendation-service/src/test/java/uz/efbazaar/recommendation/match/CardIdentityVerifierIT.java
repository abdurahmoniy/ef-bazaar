package uz.efbazaar.recommendation.match;

import org.junit.jupiter.api.BeforeEach;
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
import uz.efbazaar.recommendation.exception.RecommendationException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(CardIdentityVerifier.class)
class CardIdentityVerifierIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID PLAYER = UUID.randomUUID();

    @Autowired CardIdentityVerifier verifier;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void catalog() {
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (101, ?, 1)", PLAYER);
        jdbc.update("INSERT INTO cards_view (efhub_id, player_id, version) VALUES (102, NULL, 1)");
    }

    @Test
    void knownPairPasses() {
        assertThatCode(() -> verifier.verify(List.of(new CardIdentityVerifier.Claim(101, PLAYER))))
                .doesNotThrowAnyException();
    }

    @Test
    void fabricatedPlayerIsRejected() {
        assertThatThrownBy(() -> verifier.verify(List.of(new CardIdentityVerifier.Claim(101, UUID.randomUUID()))))
                .isInstanceOf(RecommendationException.class)
                .extracting(e -> ((RecommendationException) e).getCode())
                .isEqualTo("invalid_attribute_value");
    }

    /** Replay'dan oldin cards_view bo'sh — 400, 500 emas (Review Focus 5). */
    @Test
    void unknownCardIsRejected() {
        assertThatThrownBy(() -> verifier.verify(List.of(new CardIdentityVerifier.Claim(555, PLAYER))))
                .isInstanceOf(RecommendationException.class);
    }

    @Test
    void resolveSkipsCardsWithoutPlayer() {
        assertThat(verifier.resolvePlayerIds(List.of(101L, 102L, 555L)))
                .containsOnlyKeys(101L)
                .containsEntry(101L, PLAYER);
    }
}
