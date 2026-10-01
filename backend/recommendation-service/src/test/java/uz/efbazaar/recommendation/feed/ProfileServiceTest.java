package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import uz.efbazaar.recommendation.match.Criterion;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProfileServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-01T10:00:00Z");
    private static final UUID USER = UUID.randomUUID();

    private final ProfileRepository repository = mock(ProfileRepository.class);

    private ProfileService service(int limit) {
        FeedProperties props = new FeedProperties(1000, Duration.ofMinutes(30), new BigDecimal("1.5"), limit,
                Duration.ofDays(30));
        return new ProfileService(repository, props, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void metaBoostSortingAndLimit() {
        UUID p = UUID.randomUUID();
        UUID q = UUID.randomUUID();
        UUID r = UUID.randomUUID();
        when(repository.signals(USER, NOW.minus(Duration.ofDays(30)))).thenReturn(List.of(
                new ProfileSignal(101, p, BigDecimal.ONE, true),
                new ProfileSignal(202, q, new BigDecimal("2"), false),
                new ProfileSignal(303, r, BigDecimal.ONE, false)));

        List<Criterion> profile = service(2).profile(USER);

        assertThat(profile).extracting(Criterion::efhubId).containsExactly(202L, 101L);
        assertThat(profile.get(1).weight()).isEqualByComparingTo("1.5");
    }

    @Test
    void equalWeightsAreOrderedByCardId() {
        when(repository.signals(USER, NOW.minus(Duration.ofDays(30)))).thenReturn(List.of(
                new ProfileSignal(303, UUID.randomUUID(), BigDecimal.ONE, false),
                new ProfileSignal(101, UUID.randomUUID(), BigDecimal.ONE, false)));

        assertThat(service(50).profile(USER)).extracting(Criterion::efhubId).containsExactly(101L, 303L);
    }
}
