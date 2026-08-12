package uz.efbazaar.payment.health;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Freshness of the humo-userbot's heartbeat, and therefore whether the platform
 * can currently see incoming transfers.
 *
 * <p>Held in memory on purpose. After a restart the userbot is unproven until a
 * heartbeat arrives — which takes at most one interval. A persisted timestamp
 * would let a stale row vouch for a userbot that died during the restart. A
 * freshly constructed instance — {@code lastSeen == null} — therefore reports
 * unhealthy: that is the state every fresh deployment starts in, not a corner
 * case, and taking deposits before anything has proven it is watching the
 * bank feed is exactly the failure this class exists to prevent.
 *
 * <p>Takes a {@link Clock} rather than calling {@code Instant.now()} directly
 * so tests can model "the userbot went quiet" the way it actually happens in
 * production — by advancing time forward — instead of rewinding a recorded
 * timestamp, which {@link #record} deliberately refuses.
 */
@Slf4j
@Component
public class UserbotHealth {

    private final AtomicReference<Instant> lastSeen = new AtomicReference<>();
    private final Clock clock;
    private final long timeoutSeconds;

    public UserbotHealth(Clock clock,
                          @Value("${payment.userbot.heartbeat-timeout-seconds}") long timeoutSeconds) {
        this.clock = clock;
        this.timeoutSeconds = timeoutSeconds;
    }

    /** Kafka delivery can reorder; an older beat never un-heals a live bot. */
    public void record(Instant sentAt) {
        lastSeen.updateAndGet(current ->
                current == null || sentAt.isAfter(current) ? sentAt : current);
    }

    public boolean isHealthy() {
        Instant seen = lastSeen.get();
        return seen != null
                && seen.isAfter(Instant.now(clock).minus(Duration.ofSeconds(timeoutSeconds)));
    }

    public Optional<Instant> lastSeenAt() {
        return Optional.ofNullable(lastSeen.get());
    }

    public long timeoutSeconds() {
        return timeoutSeconds;
    }
}
