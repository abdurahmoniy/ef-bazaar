package uz.efbazaar.recommendation.feed;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisFeedCacheTest {

    private static final UUID USER = UUID.randomUUID();
    private static final String HASH = "a".repeat(64);
    private static final FeedProperties PROPS = new FeedProperties(1000, Duration.ofMinutes(30),
            new BigDecimal("1.5"), 50, Duration.ofDays(30));

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final RedisFeedCache cache = new RedisFeedCache(redis, PROPS);

    @Test
    void readsStoredSnapshot() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("rec:feed:" + USER + ":" + HASH)).thenReturn(a + "," + b);

        assertThat(cache.get(USER, HASH)).contains(List.of(a, b));
    }

    @Test
    void emptySnapshotIsAnEmptyListNotAMiss() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("rec:feed:" + USER + ":" + HASH)).thenReturn("");

        assertThat(cache.get(USER, HASH)).contains(List.of());
    }

    @Test
    void putUsesKeyAndTtl() {
        UUID a = UUID.randomUUID();
        when(redis.opsForValue()).thenReturn(values);

        cache.put(USER, HASH, List.of(a));

        verify(values).set("rec:feed:" + USER + ":" + HASH, a.toString(), Duration.ofMinutes(30));
    }

    /** Redis o'chiq — lenta joyida hisoblanadi, 500 yo'q (Review Focus 3). */
    @Test
    void redisFailureDegradesQuietly() {
        when(redis.opsForValue()).thenThrow(new RedisConnectionFailureException("down"));

        assertThat(cache.get(USER, HASH)).isEmpty();
        assertThatCode(() -> cache.put(USER, HASH, List.of(UUID.randomUUID()))).doesNotThrowAnyException();
    }
}
