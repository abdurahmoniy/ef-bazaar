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

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@Import(ProfileRepository.class)
class ProfileRepositoryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final UUID P = UUID.randomUUID();
    private static final UUID Q = UUID.randomUUID();
    private static final UUID R = UUID.randomUUID();

    @Autowired ProfileRepository repository;
    @Autowired JdbcTemplate jdbc;

    private Instant since() {
        return Instant.now().minus(Duration.ofDays(30));
    }

    private void team(UUID user, String slotsJson) {
        jdbc.update("INSERT INTO dream_teams (id, user_id, name, slots) VALUES (?, ?, 'Mening jamoam', ?::jsonb)",
                UUID.randomUUID(), user, slotsJson);
    }

    private UUID listingWith(long efhubId, UUID player) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO listings_view (listing_id, seller_id, status, price, version) VALUES (?, ?, 'ACTIVE', 1, 1)",
                id, UUID.randomUUID());
        jdbc.update("INSERT INTO listing_cards_view VALUES (?, ?, ?)", id, efhubId, player);
        return id;
    }

    private void card(long efhubId, UUID player, String metaTier, String from, String until) {
        jdbc.update("""
                INSERT INTO cards_view (efhub_id, player_id, meta_tier, active_from, active_until, version)
                VALUES (?, ?, ?, ?::timestamptz, ?::timestamptz, 1)
                """, efhubId, player, metaTier, from, until);
    }

    private Map<Long, String> weights(UUID user) {
        return repository.signals(user, since()).stream().collect(Collectors.toMap(
                ProfileSignal::efhubId, s -> s.weight().stripTrailingZeros().toPlainString()));
    }

    @Test
    void dreamTeamLikesAndInterestAreSummedPerCard() {
        UUID user = UUID.randomUUID();
        team(user, "[{\"index\":0,\"position\":\"GK\",\"w\":3,\"card\":{\"efhubId\":101,\"playerId\":\"" + P + "\"}}]");
        UUID liked = listingWith(101, P);
        jdbc.update("INSERT INTO listing_cards_view VALUES (?, 202, ?)", liked, Q);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, true, 1)", user, liked);
        card(303, R, "NORMAL", null, null);
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 303, now())", user);

        assertThat(weights(user)).containsExactlyInAnyOrderEntriesOf(Map.of(101L, "4", 202L, "1", 303L, "1"));
    }

    @Test
    void unlikedListingAndOldInterestDoNotCount() {
        UUID user = UUID.randomUUID();
        UUID listing = listingWith(101, P);
        jdbc.update("INSERT INTO user_likes VALUES (?, ?, false, 2)", user, listing);
        card(303, R, "NORMAL", null, null);
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 303, now() - interval '40 days')", user);

        assertThat(repository.signals(user, since())).isEmpty();
    }

    @Test
    void interestOnCardMissingFromCatalogIsSkipped() {
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO user_card_interest VALUES (?, 999, now())", user);

        assertThat(repository.signals(user, since())).isEmpty();
    }

    /** marketplace'dan ko'chirilgan eski/buzilgan slot lentani yiqitmaydi (Review Focus 2). */
    @Test
    void malformedSlotIsSkipped() {
        UUID user = UUID.randomUUID();
        team(user, "[{\"index\":0,\"w\":1,\"card\":{\"efhubId\":\"abc\",\"playerId\":\"not-a-uuid\"}},"
                + "\"garbage\","
                + "{\"index\":1,\"w\":1,\"card\":{\"efhubId\":202,\"playerId\":\"" + Q + "\"}}]");

        assertThat(repository.signals(user, since())).extracting(ProfileSignal::efhubId).containsExactly(202L);
    }

    @Test
    void activeMetaFlagFollowsTheWindow() {
        UUID user = UUID.randomUUID();
        card(101, P, "META", "2026-01-01T00:00:00Z", null);
        card(202, Q, "META", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z");
        card(303, R, "NORMAL", null, null);
        for (long id : List.of(101L, 202L, 303L)) {
            jdbc.update("INSERT INTO user_card_interest VALUES (?, ?, now())", user, id);
        }

        Map<Long, Boolean> meta = repository.signals(user, since()).stream()
                .collect(Collectors.toMap(ProfileSignal::efhubId, ProfileSignal::activeMeta));

        assertThat(meta).containsExactlyInAnyOrderEntriesOf(Map.of(101L, true, 202L, false, 303L, false));
    }
}
