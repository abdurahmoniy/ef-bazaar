package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import uz.efbazaar.recommendation.match.Criterion;
import uz.efbazaar.recommendation.match.MatchDetails;
import uz.efbazaar.recommendation.match.MatchEngine;
import uz.efbazaar.recommendation.match.MatchHit;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class FeedServiceTest {

    static final class InMemoryCache implements FeedCache {
        final Map<String, List<UUID>> entries = new HashMap<>();

        @Override
        public Optional<List<UUID>> get(UUID userId, String profileHash) {
            return Optional.ofNullable(entries.get(userId + ":" + profileHash));
        }

        @Override
        public void put(UUID userId, String profileHash, List<UUID> ids) {
            entries.put(userId + ":" + profileHash, ids);
        }
    }

    private static final UUID USER = UUID.randomUUID();
    private static final FeedProperties PROPS = new FeedProperties(1000, Duration.ofMinutes(30),
            new BigDecimal("1.5"), 50, Duration.ofDays(30));

    private final ProfileService profiles = mock(ProfileService.class);
    private final FeedRanker ranker = mock(FeedRanker.class);
    private final MatchEngine engine = mock(MatchEngine.class);
    private final InMemoryCache cache = new InMemoryCache();
    private final FeedService service = new FeedService(profiles, ranker, engine, cache, PROPS);

    private static List<Criterion> profile(long efhubId, String weight) {
        return List.of(new Criterion(efhubId, UUID.randomUUID(), new BigDecimal(weight)));
    }

    @Test
    void guestGetsAnEmptyFeed() {
        assertThat(service.feed(null, null)).isEqualTo(FeedResponse.EMPTY);
        verifyNoInteractions(profiles, ranker);
    }

    @Test
    void emptyProfileGetsAnEmptyFeed() {
        when(profiles.profile(USER)).thenReturn(List.of());

        assertThat(service.feed(USER, null).empty()).isTrue();
        verifyNoInteractions(ranker);
    }

    @Test
    void firstPagePinsTheSnapshot() {
        List<Criterion> profile = profile(101, "1");
        UUID a = UUID.randomUUID();
        when(profiles.profile(USER)).thenReturn(profile);
        when(ranker.rank(profile, USER, 1000)).thenReturn(List.of(a));

        FeedResponse response = service.feed(USER, null);

        assertThat(response.empty()).isFalse();
        assertThat(response.ids()).containsExactly(a);
        assertThat(response.profileHash()).isEqualTo(ProfileHash.of(profile));
        assertThat(cache.get(USER, response.profileHash())).contains(List.of(a));
    }

    /** Sessiya o'rtasida like bosildi — joriy sahifalash o'zgarmaydi (spec §4.5). */
    @Test
    void pinnedHashSurvivesProfileChange() {
        List<Criterion> before = profile(101, "1");
        UUID a = UUID.randomUUID();
        when(profiles.profile(USER)).thenReturn(before);
        when(ranker.rank(before, USER, 1000)).thenReturn(List.of(a));
        String hash = service.feed(USER, null).profileHash();
        when(profiles.profile(USER)).thenReturn(profile(101, "2"));

        FeedResponse second = service.feed(USER, hash);

        assertThat(second.ids()).containsExactly(a);
        assertThat(second.profileHash()).isEqualTo(hash);
        verify(ranker, times(1)).rank(anyList(), any(), anyInt());
    }

    @Test
    void refreshWithoutHashUsesTheNewProfile() {
        List<Criterion> before = profile(101, "1");
        List<Criterion> after = profile(101, "2");
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(profiles.profile(USER)).thenReturn(before, after);
        when(ranker.rank(before, USER, 1000)).thenReturn(List.of(a));
        when(ranker.rank(after, USER, 1000)).thenReturn(List.of(b));

        String first = service.feed(USER, null).profileHash();
        FeedResponse refreshed = service.feed(USER, null);

        assertThat(refreshed.profileHash()).isNotEqualTo(first);
        assertThat(refreshed.ids()).containsExactly(b);
    }

    @Test
    void malformedHashIsIgnored() {
        List<Criterion> profile = profile(101, "1");
        when(profiles.profile(USER)).thenReturn(profile);
        when(ranker.rank(profile, USER, 1000)).thenReturn(List.of());
        cache.entries.put(USER + ":../evil", List.of(UUID.randomUUID()));

        FeedResponse response = service.feed(USER, "../evil");

        assertThat(response.profileHash()).isEqualTo(ProfileHash.of(profile));
    }

    @Test
    void profileWithoutMatchesIsEmpty() {
        List<Criterion> profile = profile(101, "1");
        when(profiles.profile(USER)).thenReturn(profile);
        when(ranker.rank(profile, USER, 1000)).thenReturn(List.of());

        FeedResponse response = service.feed(USER, null);

        assertThat(response.empty()).isTrue();
        assertThat(response.profileHash()).isNotNull();
    }

    @Test
    void detailsUseTheCurrentProfile() {
        List<Criterion> profile = profile(101, "1");
        UUID id = UUID.randomUUID();
        MatchHit hit = new MatchHit(id, BigDecimal.ONE, 1, 0, 0, List.of(101L), List.of(), List.of(),
                BigDecimal.ONE, BigDecimal.ONE);
        when(profiles.profile(USER)).thenReturn(profile);
        when(engine.hits(eq(profile), any())).thenReturn(Map.of(id, hit));

        Map<UUID, MatchDetails> details = service.details(USER, List.of(id));

        assertThat(details.get(id).percent()).isEqualTo(100);
        assertThat(details.get(id).strictness()).isZero();
    }

    @Test
    void guestDetailsAreEmpty() {
        assertThat(service.details(null, List.of(UUID.randomUUID()))).isEmpty();
        verifyNoInteractions(profiles, engine);
    }
}
