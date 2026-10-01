package uz.efbazaar.recommendation.interest;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Shaxsiy lenta uchun login qilgan foydalanuvchining qiziqishi saqlanadi; anonimniki — yo'q. */
class CardInterestUserSignalTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-01T10:00:00Z"), ZoneOffset.UTC);

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
    private final UserCardInterestRepository userInterest = mock(UserCardInterestRepository.class);
    private final CardInterestService service =
            new CardInterestService(redis, identities, userInterest, "secret", CLOCK);

    @Test
    void loggedInApplyRecordsPersonalInterest() {
        UUID user = UUID.randomUUID();
        when(identities.resolvePlayerIds(List.of(10L, 11L)))
                .thenReturn(Map.of(10L, UUID.randomUUID(), 11L, UUID.randomUUID()));

        service.recordApply(List.of(10L, 11L, 10L), user, null);

        verify(userInterest).touch(eq(user), argThat(ids -> ids.size() == 2 && ids.containsAll(List.of(10L, 11L))));
    }

    @Test
    void anonymousApplyStaysAnonymous() {
        when(identities.resolvePlayerIds(List.of(10L))).thenReturn(Map.of(10L, UUID.randomUUID()));

        service.recordApply(List.of(10L), null, "203.0.113.10");

        verifyNoInteractions(userInterest);
    }

    @Test
    void unknownCardIsRejectedBeforeAnyWrite() {
        when(identities.resolvePlayerIds(List.of(99L))).thenReturn(Map.of());

        assertThatThrownBy(() -> service.recordApply(List.of(99L), UUID.randomUUID(), null))
                .isInstanceOf(RecommendationException.class);
        verifyNoInteractions(userInterest);
    }
}
