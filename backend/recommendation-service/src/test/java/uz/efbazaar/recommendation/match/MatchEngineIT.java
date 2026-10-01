package uz.efbazaar.recommendation.match;

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
import uz.efbazaar.recommendation.match.MatchCardCriterion.Importance;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Oltin test: marketplace {@code PlayerMatchPersistenceIT} dagi holatlar projection ustida
 * bir xil ID va bir xil ball beradi (spec §9 "Match parity").
 */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(MatchEngine.class)
class MatchEngineIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MatchEngine engine;
    @Autowired JdbcTemplate jdbc;

    private UUID listing(String status, Double valueScore) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO listings_view (listing_id, seller_id, status, price, value_score, version)
                VALUES (?, ?, ?, 100000, ?, 1)
                """, id, UUID.randomUUID(), status, valueScore);
        return id;
    }

    private void card(UUID listingId, long efhubId, UUID playerId) {
        jdbc.update("INSERT INTO listing_cards_view (listing_id, efhub_id, player_id) VALUES (?, ?, ?)",
                listingId, efhubId, playerId);
    }

    private static MatchRequest request(int strictness, MatchCardCriterion... criteria) {
        return new MatchRequest(List.of(criteria), strictness);
    }

    @Test
    void goldenParityExactBeatsAlternateAndStrictnessCuts() {
        UUID player = UUID.randomUUID();
        UUID exact = listing("ACTIVE", null);
        UUID alternate = listing("ACTIVE", null);
        listing("ACTIVE", null);
        card(exact, 101L, player);
        card(alternate, 202L, player);
        MatchRequest seven = request(7, new MatchCardCriterion(101L, player, Importance.NORMAL));

        assertThat(engine.rank(seven, 1000)).containsExactly(exact, alternate);
        Map<UUID, MatchHit> hits = engine.hits(seven.weighted(), List.of(exact, alternate));
        assertThat(hits.get(exact).score()).isEqualByComparingTo("1.0");
        assertThat(hits.get(alternate).score()).isEqualByComparingTo("0.75");

        assertThat(engine.rank(request(8, seven.criteria().getFirst()), 1000)).containsExactly(exact);
    }

    @Test
    void strictnessOneNeedsAnyPositiveOverlap() {
        UUID player = UUID.randomUUID();
        UUID alternate = listing("ACTIVE", null);
        listing("ACTIVE", null);
        card(alternate, 202L, player);

        assertThat(engine.rank(request(1, new MatchCardCriterion(101L, player, Importance.NORMAL)), 1000))
                .containsExactly(alternate);
    }

    @Test
    void priorityWeightsTheScore() {
        UUID playerA = UUID.randomUUID();
        UUID playerB = UUID.randomUUID();
        UUID onlyNormal = listing("ACTIVE", null);
        UUID onlyPriority = listing("ACTIVE", null);
        card(onlyNormal, 101L, playerA);
        card(onlyPriority, 202L, playerB);
        MatchRequest req = request(2,
                new MatchCardCriterion(101L, playerA, Importance.NORMAL),
                new MatchCardCriterion(202L, playerB, Importance.PRIORITY));

        assertThat(engine.rank(req, 1000)).containsExactly(onlyPriority, onlyNormal);
        Map<UUID, MatchHit> hits = engine.hits(req.weighted(), List.of(onlyNormal, onlyPriority));
        assertThat(hits.get(onlyNormal).score()).isEqualByComparingTo("0.25");
        assertThat(hits.get(onlyPriority).score()).isEqualByComparingTo("0.75");
    }

    @Test
    void onlyActiveListingsAreRankedButDetailsWorkForAny() {
        UUID player = UUID.randomUUID();
        UUID sold = listing("SOLD", 0.9);
        card(sold, 101L, player);
        MatchRequest req = request(4, new MatchCardCriterion(101L, player, Importance.NORMAL));

        assertThat(engine.rank(req, 1000)).isEmpty();
        assertThat(engine.hits(req.weighted(), List.of(sold))).containsKey(sold);
    }

    @Test
    void equalScoresAreOrderedByValueScoreWithNullsLast() {
        UUID player = UUID.randomUUID();
        UUID low = listing("ACTIVE", 0.2);
        UUID high = listing("ACTIVE", 0.9);
        UUID unknown = listing("ACTIVE", null);
        for (UUID id : List.of(low, high, unknown)) card(id, 101L, player);

        assertThat(engine.rank(request(4, new MatchCardCriterion(101L, player, Importance.NORMAL)), 1000))
                .containsExactly(high, low, unknown);
    }

    @Test
    void limitCapsTheResult() {
        UUID player = UUID.randomUUID();
        for (int i = 0; i < 3; i++) card(listing("ACTIVE", null), 101L, player);

        assertThat(engine.rank(request(4, new MatchCardCriterion(101L, player, Importance.NORMAL)), 2))
                .hasSize(2);
    }

    @Test
    void detailsListExactAlternateMissingAndWeights() {
        UUID playerA = UUID.randomUUID();
        UUID playerB = UUID.randomUUID();
        UUID playerC = UUID.randomUUID();
        UUID id = listing("ACTIVE", null);
        card(id, 101L, playerA);
        card(id, 999L, playerB);
        MatchRequest req = request(4,
                new MatchCardCriterion(101L, playerA, Importance.NORMAL),
                new MatchCardCriterion(202L, playerB, Importance.PRIORITY),
                new MatchCardCriterion(303L, playerC, Importance.NORMAL));

        MatchHit hit = engine.hits(req.weighted(), List.of(id)).get(id);
        MatchDetails details = MatchDetails.of(hit, req);

        assertThat(hit.exactEfhubIds()).containsExactly(101L);
        assertThat(hit.alternateEfhubIds()).containsExactly(202L);
        assertThat(hit.missingEfhubIds()).containsExactly(303L);
        assertThat(hit.earnedWeight()).isEqualByComparingTo("3.25");
        assertThat(hit.possibleWeight()).isEqualByComparingTo("5");
        assertThat(details.percent()).isEqualTo(65);
        assertThat(details.selectedCount()).isEqualTo(3);
        assertThat(details.priorityEfhubIds()).containsExactly(202L);
    }

    @Test
    void unknownListingHasNoHit() {
        UUID player = UUID.randomUUID();
        assertThat(engine.hits(List.of(new Criterion(101L, player, java.math.BigDecimal.ONE)),
                List.of(UUID.randomUUID()))).isEmpty();
    }
}
