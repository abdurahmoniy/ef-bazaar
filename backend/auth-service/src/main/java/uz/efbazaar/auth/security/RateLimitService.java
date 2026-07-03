package uz.efbazaar.auth.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Fixed-window rate limiter backed by Redis. The window is 60 seconds — INCR on
 * a per-endpoint-per-IP key, EXPIRE the key when it's first created, and treat
 * any Redis failure as "allow" so an outage doesn't take auth offline.
 *
 * <p>Fixed window is coarser than a sliding window and can allow up to 2x the
 * budget across a window boundary. That trade is deliberate: this is spam
 * protection, not fair-use accounting, and INCR+EXPIRE is a single round-trip
 * with no Lua script needed.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RateLimitService {

    private static final String PREFIX = "rl:";
    private static final Duration WINDOW = Duration.ofSeconds(60);

    private final StringRedisTemplate redis;

    /**
     * Register a hit and check whether the caller is still within budget.
     *
     * @return {@code true} if the request is allowed, {@code false} if the
     *         caller has exceeded {@code limit} hits in the current 60s window.
     */
    public boolean tryAcquire(String endpointKey, String clientIp, int limit) {
        if (limit <= 0) return true;
        String key = PREFIX + endpointKey + ":" + clientIp;
        try {
            Long count = redis.opsForValue().increment(key);
            if (count == null) return true;
            if (count == 1L) {
                redis.expire(key, WINDOW);
            }
            return count <= limit;
        } catch (Exception ex) {
            // Fail open — a Redis outage shouldn't lock users out of login.
            log.warn("Rate limit check failed for {}:{} — allowing: {}",
                    endpointKey, clientIp, ex.getMessage());
            return true;
        }
    }
}
