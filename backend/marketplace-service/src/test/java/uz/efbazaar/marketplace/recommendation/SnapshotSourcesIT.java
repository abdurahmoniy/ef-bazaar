package uz.efbazaar.marketplace.recommendation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.CardRef;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.LikeSnapshot;
import uz.efbazaar.marketplace.recommendation.RecommendationSnapshots.ListingSnapshot;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
class SnapshotSourcesIT {

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private JdbcTemplate jdbc;

    @BeforeEach
    void schema() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
        jdbc.execute("""
                CREATE TABLE listings (id UUID PRIMARY KEY, seller_id UUID NOT NULL, status VARCHAR(16) NOT NULL,
                    price NUMERIC(19,2) NOT NULL, value_score DOUBLE PRECISION);
                CREATE TABLE listing_cards (listing_id UUID NOT NULL, efhub_id BIGINT NOT NULL,
                    player_id UUID NOT NULL, ordinal SMALLINT NOT NULL);
                CREATE TABLE listing_likes (listing_id UUID NOT NULL, user_id UUID NOT NULL);
                """);
    }

    @Test
    void listingSnapshotCarriesCurrentStateAndOrderedCards() {
        UUID id = UUID.randomUUID(), seller = UUID.randomUUID(), p1 = UUID.randomUUID(), p2 = UUID.randomUUID();
        jdbc.update("INSERT INTO listings VALUES (?, ?, 'ACTIVE', 150000, 0.42)", id, seller);
        jdbc.update("INSERT INTO listing_cards VALUES (?, 89002, ?, 1), (?, 89001, ?, 0)", id, p2, id, p1);

        ListingSnapshot s = (ListingSnapshot) new ListingSnapshotSource(jdbc).build(id.toString(), 7).orElseThrow();

        assertThat(s.listingId()).isEqualTo(id);
        assertThat(s.sellerId()).isEqualTo(seller);
        assertThat(s.status()).isEqualTo("ACTIVE");
        assertThat(s.price()).isEqualByComparingTo(new BigDecimal("150000"));
        assertThat(s.valueScore()).isEqualTo(0.42);
        assertThat(s.cards()).containsExactly(new CardRef(89001, p1), new CardRef(89002, p2));
        assertThat(s.version()).isEqualTo(7);
        assertThat(s.idempotencyKey()).isEqualTo("listing:" + id + ":7");
    }

    @Test
    void hardDeletedListingProducesNoSnapshot() {
        assertThat(new ListingSnapshotSource(jdbc).build(UUID.randomUUID().toString(), 1)).isEmpty();
    }

    @Test
    void likeSnapshotReflectsWhetherTheLikeExistsNow() {
        UUID listing = UUID.randomUUID(), user = UUID.randomUUID();
        LikeSnapshotSource source = new LikeSnapshotSource(jdbc);
        String entity = user + ":" + listing;

        jdbc.update("INSERT INTO listing_likes VALUES (?, ?)", listing, user);
        LikeSnapshot liked = (LikeSnapshot) source.build(entity, 3).orElseThrow();
        assertThat(liked.liked()).isTrue();
        assertThat(liked.listingId()).isEqualTo(listing);
        assertThat(liked.userId()).isEqualTo(user);

        // bosildi va darhol olib tashlandi — relay faqat oxirgi holatni ko'radi
        jdbc.update("DELETE FROM listing_likes");
        assertThat(((LikeSnapshot) source.build(entity, 4).orElseThrow()).liked()).isFalse();
        assertThat(source.key(entity)).isEqualTo(listing.toString());
    }

    @Test
    void malformedLikeEntityIsDropped() {
        assertThat(new LikeSnapshotSource(jdbc).build("garbage", 1)).isEmpty();
    }
}
