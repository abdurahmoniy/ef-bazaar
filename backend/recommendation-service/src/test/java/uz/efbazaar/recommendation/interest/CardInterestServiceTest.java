package uz.efbazaar.recommendation.interest;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CardInterestServiceTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-03T10:00:00Z"), ZoneOffset.UTC);

    @SuppressWarnings("unchecked")
    @Test
    void recordsAtMostOneEventPerIdentityCardDayWithNinetyDayTtl() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
        long cardId = 89138556575063L;
        when(identities.resolvePlayerIds(List.of(cardId))).thenReturn(Map.of(cardId, UUID.randomUUID()));
        when(redis.execute(any(RedisScript.class), anyList(), any(), any(), any()))
                .thenReturn(1L)
                .thenReturn(0L);
        CardInterestService service = new CardInterestService(redis, identities, mock(UserCardInterestRepository.class), "secret", CLOCK);
        UUID userId = UUID.randomUUID();

        assertThat(service.recordApply(List.of(cardId), userId, "ignored").accepted()).isEqualTo(1);
        assertThat(service.recordApply(List.of(cardId), userId, "ignored").duplicates()).isEqualTo(1);

        org.mockito.ArgumentCaptor<List<String>> keys = org.mockito.ArgumentCaptor.forClass(List.class);
        org.mockito.ArgumentCaptor<Object> ttl = org.mockito.ArgumentCaptor.forClass(Object.class);
        verify(redis, org.mockito.Mockito.atLeastOnce()).execute(
                any(RedisScript.class), keys.capture(), ttl.capture(), any(), any());
        assertThat(keys.getValue().getFirst())
                .contains("2026-08-03")
                .doesNotContain(userId.toString())
                .contains(service.hmac("user:" + userId));
        assertThat(String.valueOf(ttl.getValue())).isEqualTo(String.valueOf(90L * 24 * 60 * 60));
    }

    @Test
    void rejectsUnknownCardsAndAnonymousRequestsWithoutTrustedNetworkIdentity() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
        when(identities.resolvePlayerIds(List.of(99L))).thenReturn(Map.of());
        CardInterestService service = new CardInterestService(redis, identities, mock(UserCardInterestRepository.class), "secret", CLOCK);

        assertThatThrownBy(() -> service.recordApply(List.of(99L), null, "203.0.113.10"))
                .isInstanceOf(RecommendationException.class);
        when(identities.resolvePlayerIds(List.of(10L))).thenReturn(Map.of(10L, UUID.randomUUID()));
        assertThatThrownBy(() -> service.recordApply(List.of(10L), null, null))
                .isInstanceOf(RecommendationException.class);
    }

    @SuppressWarnings("unchecked")
    @Test
    void anonymousDedupeUsesTrustedNetworkIdentityInsteadOfCallerMintedToken() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        CardIdentityVerifier identities = mock(CardIdentityVerifier.class);
        long cardId = 89138556575063L;
        when(identities.resolvePlayerIds(List.of(cardId))).thenReturn(Map.of(cardId, UUID.randomUUID()));
        when(redis.execute(any(RedisScript.class), anyList(), any(), any(), any())).thenReturn(1L);
        CardInterestService service = new CardInterestService(redis, identities, mock(UserCardInterestRepository.class), "secret", CLOCK);

        service.recordApply(List.of(cardId), null, "203.0.113.10");

        org.mockito.ArgumentCaptor<List<String>> keys = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(redis).execute(any(RedisScript.class), keys.capture(), any(), any(), any());
        assertThat(keys.getValue().getFirst())
                .contains(service.hmac("network:203.0.113.10"))
                .doesNotContain("203.0.113.10");
        assertThat(keys.getValue().get(2))
                .contains("budget")
                .contains(service.hmac("network:203.0.113.10"));
    }

    @Test
    void refusesToStartWithoutAConfiguredHmacSecret() {
        assertThatThrownBy(() -> new CardInterestService(
                mock(StringRedisTemplate.class), mock(CardIdentityVerifier.class), mock(UserCardInterestRepository.class), " ", CLOCK))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CARD_INTEREST_HMAC_SECRET");
    }

    @SuppressWarnings("unchecked")
    @Test
    void aggregatesSevenAndThirtyDayCountsWithoutStoringRawIdentities() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        when(redis.opsForHash()).thenReturn(hashes);
        when(hashes.multiGet(any(String.class), anyList())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0);
            String date = key.substring(key.lastIndexOf(':') + 1);
            long daysAgo = java.time.temporal.ChronoUnit.DAYS.between(
                    java.time.LocalDate.parse(date), java.time.LocalDate.of(2026, 8, 3));
            return List.of(daysAgo < 7 ? "2" : "1");
        });
        CardInterestService service = new CardInterestService(
                redis, mock(CardIdentityVerifier.class), mock(UserCardInterestRepository.class), "secret", CLOCK);

        CardInterestService.Counts counts = service.counts(List.of(10L)).get(10L);

        assertThat(counts.days7()).isEqualTo(14);
        assertThat(counts.days30()).isEqualTo(37);
    }

    @Test
    void aggregateFailureFallsBackToZerosSoAdminCatalogueStillLoads() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForHash()).thenThrow(new IllegalStateException("redis unavailable"));
        CardInterestService service = new CardInterestService(
                redis, mock(CardIdentityVerifier.class), mock(UserCardInterestRepository.class), "secret", CLOCK);

        assertThat(service.counts(List.of(10L)).get(10L))
                .isEqualTo(new CardInterestService.Counts(0, 0));
    }
}
