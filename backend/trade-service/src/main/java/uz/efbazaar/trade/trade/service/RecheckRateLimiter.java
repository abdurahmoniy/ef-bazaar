package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.exception.RateLimitedException;

import java.time.Duration;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class RecheckRateLimiter {

    private final StringRedisTemplate redis;

    @Value("${trade.recheck.max-per-trade}") private long maxClicks;
    @Value("${trade.recheck.min-interval-seconds}") private long minIntervalSec;

    /**
     * Enforces spec §3.3: max clicks / trade, min interval between clicks.
     * Uses two Redis keys, both scoped to trade id and expiring together with
     * the state-4 window (30 min).
     */
    public void reserve(UUID tradeId) {
        String countKey = "trade:" + tradeId + ":recheck:count";
        String lastKey  = "trade:" + tradeId + ":recheck:last-at";

        Long last = readLong(lastKey);
        long now = System.currentTimeMillis();
        if (last != null && (now - last) < (minIntervalSec * 1000)) {
            long secLeft = minIntervalSec - (now - last) / 1000;
            throw new RateLimitedException("Recheck too soon — retry in " + secLeft + "s");
        }
        Long count = redis.opsForValue().increment(countKey);
        if (count == 1) {
            redis.expire(countKey, Duration.ofSeconds(1800));
        }
        if (count > maxClicks) {
            throw new RateLimitedException("Recheck limit reached for this trade");
        }
        redis.opsForValue().set(lastKey, String.valueOf(now), Duration.ofSeconds(1800));
    }

    private Long readLong(String key) {
        String v = redis.opsForValue().get(key);
        return v != null ? Long.parseLong(v) : null;
    }
}
