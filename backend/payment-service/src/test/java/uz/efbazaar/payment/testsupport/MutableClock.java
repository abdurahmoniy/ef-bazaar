package uz.efbazaar.payment.testsupport;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A {@link Clock} a test can push forward on demand.
 *
 * <p>Staleness in production happens because time moves forward while a
 * heartbeat stays put — never because a heartbeat gets rewound. This lets a
 * test reproduce that: stamp a beat against the current instant, then
 * {@link #advance} past the timeout, rather than recording an
 * artificially-old timestamp (which {@code UserbotHealth}'s monotonic guard
 * would reject anyway, and which does not model anything that actually
 * happens).
 */
public final class MutableClock extends Clock {

    private final AtomicReference<Instant> now;
    private final ZoneId zone;

    public MutableClock() {
        this(Instant.now(), ZoneId.of("UTC"));
    }

    private MutableClock(Instant now, ZoneId zone) {
        this.now = new AtomicReference<>(now);
        this.zone = zone;
    }

    /** Establishes a known baseline. Call this in every test's own setup. */
    public void reset(Instant instant) {
        now.set(instant);
    }

    public void advance(Duration duration) {
        now.updateAndGet(i -> i.plus(duration));
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return new MutableClock(now.get(), zone);
    }

    @Override
    public Instant instant() {
        return now.get();
    }
}
