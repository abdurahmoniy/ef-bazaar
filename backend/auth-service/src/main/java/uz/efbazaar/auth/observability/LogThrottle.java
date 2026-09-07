package uz.efbazaar.auth.observability;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * Decides which log events are worth a Telegram message.
 *
 * <p>Without this, the alerting channel dies exactly when it matters. On
 * 2026-09-07 trade-service wrote 669,000 lines a minute; forwarded verbatim
 * that is 11,000 Kafka records and 11,000 Telegram messages a second, against
 * a 420 MB broker and a group that accepts about 30 a second. The flood would
 * have taken out the channel reporting it.
 *
 * <p>Two independent limits, because they catch different shapes of trouble:
 *
 * <ul>
 *   <li><b>Dedup</b> — the same error repeating is one piece of information,
 *       not a thousand. Keyed by caller, so a loop reports once a window.</li>
 *   <li><b>Ceiling</b> — many <em>different</em> errors at once is a flood
 *       dedup cannot see. Nothing beyond the cap leaves the process.</li>
 * </ul>
 *
 * <p>What is dropped is counted and reported on the next window, once. Silent
 * suppression would turn a flood into a silence, which reads exactly like
 * everything being fine.
 *
 * <p>Thread-safe: logging arrives from every thread in the service.
 */
public final class LogThrottle {

    /** Whether to publish, and what was dropped since the last report. */
    public record Verdict(boolean send, int suppressed) {
        private static final Verdict DROP = new Verdict(false, 0);
        private static final Verdict PASS = new Verdict(true, 0);
    }

    private final int maxPerWindow;
    private final long windowMillis;
    private final long dedupMillis;
    private final int maxTrackedKeys;
    private final LongSupplier clock;

    private final Map<String, Long> lastSeen = new ConcurrentHashMap<>();
    private final AtomicLong windowStart;
    private final AtomicInteger sentInWindow = new AtomicInteger();
    private final AtomicInteger suppressedInWindow = new AtomicInteger();
    /** Carries the previous window's drop count until someone reports it. */
    private final AtomicInteger pendingReport = new AtomicInteger();

    public LogThrottle(int maxPerWindow, long windowMillis, long dedupMillis,
                       int maxTrackedKeys, LongSupplier clock) {
        this.maxPerWindow = maxPerWindow;
        this.windowMillis = windowMillis;
        this.dedupMillis = dedupMillis;
        this.maxTrackedKeys = maxTrackedKeys;
        this.clock = clock;
        this.windowStart = new AtomicLong(clock.getAsLong());
    }

    /** Production defaults: 20 messages a minute, identical errors once a minute. */
    public LogThrottle() {
        this(20, 60_000L, 60_000L, 500, System::currentTimeMillis);
    }

    public Verdict admit(String key) {
        long now = clock.getAsLong();
        rollWindowIfDue(now);

        Long previous = lastSeen.get(key);
        if (previous != null && now - previous < dedupMillis) {
            suppressedInWindow.incrementAndGet();
            return Verdict.DROP;
        }

        if (sentInWindow.get() >= maxPerWindow) {
            suppressedInWindow.incrementAndGet();
            return Verdict.DROP;
        }

        evictIfCrowded();
        lastSeen.put(key, now);
        sentInWindow.incrementAndGet();

        int report = pendingReport.getAndSet(0);
        return report > 0 ? new Verdict(true, report) : Verdict.PASS;
    }

    /** Visible for tests: how many keys the dedup table is holding. */
    public int trackedKeys() {
        return lastSeen.size();
    }

    private void rollWindowIfDue(long now) {
        long start = windowStart.get();
        if (now - start < windowMillis) return;
        // One thread wins the roll; the rest carry on against the new window.
        if (!windowStart.compareAndSet(start, now)) return;
        sentInWindow.set(0);
        int dropped = suppressedInWindow.getAndSet(0);
        if (dropped > 0) pendingReport.addAndGet(dropped);
    }

    /**
     * Keeps the dedup table bounded.
     *
     * <p>A key built from anything per-request — a trade id in a message —
     * would add a row per error for ever, making the guard a leak of its own.
     * Entries past their dedup window are dead weight, so they go first; if
     * that frees nothing (every key still live) the table is cleared outright
     * rather than allowed to grow. Losing dedup state costs at most one extra
     * message per key, which is the cheaper failure.
     */
    private void evictIfCrowded() {
        if (lastSeen.size() < maxTrackedKeys) return;
        long cutoff = clock.getAsLong() - dedupMillis;
        lastSeen.entrySet().removeIf(e -> e.getValue() < cutoff);
        if (lastSeen.size() >= maxTrackedKeys) lastSeen.clear();
    }
}
