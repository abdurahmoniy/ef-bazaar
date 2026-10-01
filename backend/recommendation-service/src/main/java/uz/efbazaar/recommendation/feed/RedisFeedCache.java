package uz.efbazaar.recommendation.feed;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/** Redis o'chiq bo'lsa — keshsiz ishlaydi: har sahifa joyida hisoblanadi, barqarorlik yo'qoladi. */
@Slf4j
@Component
public class RedisFeedCache implements FeedCache {

    private final StringRedisTemplate redis;
    private final FeedProperties props;

    public RedisFeedCache(StringRedisTemplate redis, FeedProperties props) {
        this.redis = redis;
        this.props = props;
    }

    @Override
    public Optional<List<UUID>> get(UUID userId, String profileHash) {
        try {
            String raw = redis.opsForValue().get(key(userId, profileHash));
            if (raw == null) return Optional.empty();
            if (raw.isEmpty()) return Optional.of(List.of());
            return Optional.of(Arrays.stream(raw.split(",")).map(UUID::fromString).toList());
        } catch (RuntimeException e) {
            log.warn("Lenta snapshot'i o'qilmadi, joyida hisoblanadi: {}", e.toString());
            return Optional.empty();
        }
    }

    @Override
    public void put(UUID userId, String profileHash, List<UUID> ids) {
        try {
            redis.opsForValue().set(key(userId, profileHash),
                    ids.stream().map(UUID::toString).collect(Collectors.joining(",")),
                    props.snapshotTtl());
        } catch (RuntimeException e) {
            log.warn("Lenta snapshot'i saqlanmadi: {}", e.toString());
        }
    }

    static String key(UUID userId, String profileHash) {
        return "rec:feed:" + userId + ":" + profileHash;
    }
}
