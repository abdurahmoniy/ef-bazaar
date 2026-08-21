package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
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
     * Enforces spec §3.3: max clicks, min interval between clicks.
     *
     * <p>Counted per party, not per trade. A sale has one Konami flow in it and
     * the two read the same; a swap has two — separate mailboxes, separate
     * password resets — and sharing one budget meant the first party to press
     * the button spent the other's allowance. Reported from testing as two
     * users clicking once each and the second being told to wait five minutes.
     *
     * <p>Both keys expire with the state-4 window (30 min).
     */
    public void reserve(UUID tradeId, ParticipantRole role) {
        String scope = "trade:" + tradeId + ":" + role + ":recheck";
        String countKey = scope + ":count";
        String lastKey  = scope + ":last-at";

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
