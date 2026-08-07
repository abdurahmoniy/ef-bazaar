package uz.efbazaar.trade.admin.presence;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Presence as a Redis key with a TTL: {@code presence:{userId}} holding the
 * epoch-millis of the last request. Online means the key still exists.
 *
 * <p>No Postgres column, on purpose: writing {@code last_seen_at} on every
 * request would add a row update to every hot-path call.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RedisPresenceQuery implements PresenceQuery {

    private static final String PREFIX = "presence:";

    private final StringRedisTemplate redis;

    @Value("${trade.presence.online-ttl-seconds:120}")
    private long onlineTtlSeconds;

    /** Called by {@link PresenceTouchInterceptor} once per authenticated request. */
    public void touch(UUID userId) {
        if (userId == null) return;
        try {
            redis.opsForValue().set(
                    PREFIX + userId,
                    Long.toString(Instant.now().toEpochMilli()),
                    Duration.ofSeconds(onlineTtlSeconds));
        } catch (RuntimeException e) {
            // Presence is cosmetic — never fail a request over it.
            log.debug("presence touch failed for {}: {}", userId, e.toString());
        }
    }

    @Override
    public Map<UUID, Presence> of(Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) return Map.of();

        List<UUID> ids = List.copyOf(userIds);
        Map<UUID, Presence> out = new HashMap<>(ids.size());
        List<String> keys = ids.stream().map(id -> PREFIX + id).toList();

        List<String> values;
        try {
            values = redis.opsForValue().multiGet(keys);
        } catch (RuntimeException e) {
            log.debug("presence lookup failed, reporting everybody offline: {}", e.toString());
            ids.forEach(id -> out.put(id, Presence.offline()));
            return out;
        }

        for (int i = 0; i < ids.size(); i++) {
            String raw = values == null ? null : values.get(i);
            if (raw == null) {
                out.put(ids.get(i), Presence.offline());
                continue;
            }
            Instant lastSeen;
            try {
                lastSeen = Instant.ofEpochMilli(Long.parseLong(raw));
            } catch (NumberFormatException e) {
                lastSeen = null;
            }
            out.put(ids.get(i), new Presence(true, lastSeen));
        }
        return out;
    }
}
