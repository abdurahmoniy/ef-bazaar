package uz.efbazaar.trade.mail.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mail.config.MailProperties;

import java.time.Clock;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-user in-memory bucket for /api/v1/mail/** — 10 req/s by default, tunable
 * via {@code trade.mail.rate-limit.per-user-per-second}. This is deliberately
 * local (not Redis) because it protects a single trade-service instance from a
 * misbehaving frontend polling loop; the small extra allowance across replicas
 * is acceptable for a read-only endpoint.
 *
 * <p>The bucket refills every whole second — no fractional accounting. That's
 * simpler than a token bucket and the frontend polls at 30s intervals, so the
 * 1-second granularity is invisible in practice.
 */
@Slf4j
@Component
public class MailRateLimiter {

    private final int perSecondLimit;
    private final Clock clock;
    private final ConcurrentHashMap<UUID, Bucket> buckets = new ConcurrentHashMap<>();

    public MailRateLimiter(MailProperties props) {
        this(props, Clock.systemUTC());
    }

    /** Test seam — inject a fixed Clock to avoid second-boundary flakes. */
    public MailRateLimiter(MailProperties props, Clock clock) {
        this.perSecondLimit = props.rateLimit().perUserPerSecond();
        this.clock = clock;
    }

    /** @return true when the request is allowed; false when the caller has exceeded the budget. */
    public boolean tryAcquire(UUID userId) {
        long now = clock.instant().getEpochSecond();
        Bucket b = buckets.computeIfAbsent(userId, u -> new Bucket());
        synchronized (b) {
            if (b.epochSecond != now) {
                b.epochSecond = now;
                b.count = 0;
            }
            if (b.count >= perSecondLimit) {
                return false;
            }
            b.count++;
            return true;
        }
    }

    private static final class Bucket {
        long epochSecond;
        int count;
    }
}
