package uz.efbazaar.recommendation.feed;

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
import uz.efbazaar.recommendation.match.Criterion;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(FeedRanker.class)
class FeedRankerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID VIEWER = UUID.randomUUID();
    private static final UUID P = UUID.randomUUID();
    private static final UUID Q = UUID.randomUUID();

    @Autowired FeedRanker ranker;
    @Autowired JdbcTemplate jdbc;

    private UUID listing(UUID seller, String status, Double valueScore) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings_view (listing_id, seller_id, status, price, value_score, version)
                VALUES (?, ?, ?, 1, ?, 1)
                """, id, seller, status, valueScore);
        return id;
    }

    private UUID listing() {
        return listing(UUID.randomUUID(), "ACTIVE", null);
    }

    private void card(UUID listingId, long efhubId, UUID player) {
        jdbc.update("INSERT INTO listing_cards_view VALUES (?, ?, ?)", listingId, efhubId, player);
    }

    @Test
    void earnedThenValueScoreOrdersTheFeed() {
        List<Criterion> profile = List.of(
                new Criterion(101, P, new BigDecimal("3")),
                new Criterion(202, Q, BigDecimal.ONE));
        UUID both = listing();
        card(both, 101, P);
        card(both, 202, Q);                                          // 3 + 1 = 4
        UUID exactP = listing();
        card(exactP, 101, P);                                        // 3
        UUID alternateP = listing(UUID.randomUUID(), "ACTIVE", 0.9);
        card(alternateP, 555, P);                                    // 2.25
        UUID alternatePLow = listing(UUID.randomUUID(), "ACTIVE", 0.1);
        card(alternatePLow, 556, P);                                 // 2.25, past value_score

        assertThat(ranker.rank(profile, VIEWER, 1000))
                .containsExactly(both, exactP, alternateP, alternatePLow);
    }

    @Test
    void ownLikedInactiveAndUnrelatedListingsAreExcluded() {
        List<Criterion> profile = List.of(new Criterion(101, P, BigDecimal.ONE));
        UUID own = listing(VIEWER, "ACTIVE", null);
        card(own, 101, P);
        UUID liked = listing();
        card(liked, 101, P);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, true, 1)", VIEWER, liked);
        UUID unliked = listing();
        card(unliked, 101, P);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, false, 2)", VIEWER, unliked);
        UUID sold = listing(UUID.randomUUID(), "SOLD", null);
        card(sold, 101, P);
        UUID unrelated = listing();
        card(unrelated, 999, Q);

        assertThat(ranker.rank(profile, VIEWER, 1000)).containsExactly(unliked);
    }

    @Test
    void limitCapsTheSnapshot() {
        List<Criterion> profile = List.of(new Criterion(101, P, BigDecimal.ONE));
        for (int i = 0; i < 3; i++) card(listing(), 101, P);

        assertThat(ranker.rank(profile, VIEWER, 2)).hasSize(2);
    }
}
