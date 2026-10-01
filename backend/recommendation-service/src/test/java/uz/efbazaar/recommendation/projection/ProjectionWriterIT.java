package uz.efbazaar.recommendation.projection;

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
import uz.efbazaar.recommendation.projection.Snapshots.CardRef;
import uz.efbazaar.recommendation.projection.Snapshots.CardSnapshot;
import uz.efbazaar.recommendation.projection.Snapshots.LikeToggled;
import uz.efbazaar.recommendation.projection.Snapshots.ListingSnapshot;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(ProjectionWriter.class)
class ProjectionWriterIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final Instant NOW = Instant.parse("2026-10-01T10:00:00Z");
    private static final UUID SELLER = UUID.randomUUID();
    private static final UUID PLAYER_A = UUID.randomUUID();
    private static final UUID PLAYER_B = UUID.randomUUID();

    @Autowired ProjectionWriter writer;
    @Autowired JdbcTemplate jdbc;

    private static ListingSnapshot listing(UUID id, long version, String status, CardRef... cards) {
        return new ListingSnapshot("listing:" + id + ":" + version, id, SELLER, status,
                new BigDecimal("150000.00"), 0.4, List.of(cards), version, NOW);
    }

    private List<Long> cardsOf(UUID id) {
        return jdbc.queryForList(
                "SELECT efhub_id FROM listing_cards_view WHERE listing_id = ? ORDER BY efhub_id", Long.class, id);
    }

    private String statusOf(UUID id) {
        return jdbc.queryForObject("SELECT status FROM listings_view WHERE listing_id = ?", String.class, id);
    }

    @Test
    void listingSnapshotInsertsRowAndCards() {
        UUID id = UUID.randomUUID();

        assertThat(writer.applyListing(listing(id, 1, "ACTIVE",
                new CardRef(101, PLAYER_A), new CardRef(202, PLAYER_B)))).isTrue();

        assertThat(statusOf(id)).isEqualTo("ACTIVE");
        assertThat(cardsOf(id)).containsExactly(101L, 202L);
        assertThat(jdbc.queryForObject("SELECT value_score FROM listings_view WHERE listing_id = ?",
                Double.class, id)).isEqualTo(0.4);
    }

    @Test
    void newerSnapshotReplacesCardsCompletely() {
        UUID id = UUID.randomUUID();
        writer.applyListing(listing(id, 1, "ACTIVE", new CardRef(101, PLAYER_A), new CardRef(202, PLAYER_B)));

        assertThat(writer.applyListing(listing(id, 2, "SOLD", new CardRef(303, PLAYER_A)))).isTrue();

        assertThat(statusOf(id)).isEqualTo("SOLD");
        assertThat(cardsOf(id)).containsExactly(303L);
    }

    @Test
    void staleSnapshotIsIgnored() {
        UUID id = UUID.randomUUID();
        writer.applyListing(listing(id, 5, "SOLD", new CardRef(505, PLAYER_A)));

        assertThat(writer.applyListing(listing(id, 3, "ACTIVE", new CardRef(101, PLAYER_A)))).isFalse();

        assertThat(statusOf(id)).isEqualTo("SOLD");
        assertThat(cardsOf(id)).containsExactly(505L);
    }

    @Test
    void sameIdempotencyKeyIsAppliedOnce() {
        UUID id = UUID.randomUUID();
        writer.applyListing(listing(id, 1, "ACTIVE", new CardRef(101, PLAYER_A)));
        ListingSnapshot replayedWithSameKey = new ListingSnapshot("listing:" + id + ":1", id, SELLER,
                "DELETED", BigDecimal.ONE, null, List.of(), 9, NOW);

        assertThat(writer.applyListing(replayedWithSameKey)).isFalse();

        assertThat(statusOf(id)).isEqualTo("ACTIVE");
        assertThat(cardsOf(id)).containsExactly(101L);
    }

    @Test
    void duplicateCardInSnapshotIsStoredOnce() {
        UUID id = UUID.randomUUID();

        writer.applyListing(listing(id, 1, "ACTIVE", new CardRef(101, PLAYER_A), new CardRef(101, PLAYER_A)));

        assertThat(cardsOf(id)).containsExactly(101L);
    }

    @Test
    void unlikeKeepsRowAndStaleLikeCannotResurrectIt() {
        UUID user = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        writer.applyLike(new LikeToggled("like:" + user + ":" + listingId + ":1", listingId, user, true, 1, NOW));
        writer.applyLike(new LikeToggled("like:" + user + ":" + listingId + ":2", listingId, user, false, 2, NOW));

        // Kechikkan qayta yuborish (boshqa kalit, eski version).
        assertThat(writer.applyLike(new LikeToggled("like:late", listingId, user, true, 1, NOW))).isFalse();

        assertThat(jdbc.queryForObject("SELECT liked FROM user_likes WHERE user_id = ? AND listing_id = ?",
                Boolean.class, user, listingId)).isFalse();
    }

    @Test
    void cardSnapshotUpsertsWithVersionGuard() {
        CardSnapshot v2 = new CardSnapshot("card:777:2", 777, PLAYER_A, "EPIC", 103, "META", 40,
                Instant.parse("2026-09-01T00:00:00Z"), null, 2, NOW);
        CardSnapshot v1 = new CardSnapshot("card:777:1", 777, PLAYER_B, "EPIC", 99, "NORMAL", 0,
                null, null, 1, NOW);

        assertThat(writer.applyCard(v2)).isTrue();
        assertThat(writer.applyCard(v1)).isFalse();

        assertThat(jdbc.queryForObject("SELECT meta_tier FROM cards_view WHERE efhub_id = 777", String.class))
                .isEqualTo("META");
        assertThat(jdbc.queryForObject("SELECT player_id FROM cards_view WHERE efhub_id = 777", UUID.class))
                .isEqualTo(PLAYER_A);
    }
}
