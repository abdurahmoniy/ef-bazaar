package uz.efbazaar.trade.observability;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the Telegram channel against the service it reports on.
 *
 * <p>On 2026-09-07 trade-service wrote 669,000 log lines a minute. Had it
 * carried the log forwarder that auth and marketplace carry, every one of
 * those would have become a Kafka record and a Telegram message: Kafka runs
 * on a 420 MB heap here, and Telegram accepts roughly 30 messages a second
 * to a group before it throttles the bot. The alerting channel would have
 * died at the exact moment it was needed.
 *
 * <p>So the forwarder throttles at the source — before Kafka, not in the bot.
 */
class LogThrottleTest {

    private static final long WINDOW = 60_000L;
    private static final int CAP = 20;

    private final AtomicLong clock = new AtomicLong(1_000_000L);

    private LogThrottle throttle() {
        return new LogThrottle(CAP, WINDOW, WINDOW, 500, clock::get);
    }

    @Test
    @DisplayName("the same error repeating is sent once, not every time")
    void identicalErrorsCollapse() {
        LogThrottle t = throttle();

        assertThat(t.admit("Handler|NullPointerException").send()).isTrue();
        assertThat(t.admit("Handler|NullPointerException").send()).isFalse();
        assertThat(t.admit("Handler|NullPointerException").send()).isFalse();
    }

    @Test
    @DisplayName("a repeat is sent again once its dedup window has passed")
    void aRepeatIsSentAgainLater() {
        LogThrottle t = throttle();
        t.admit("Handler|NullPointerException");

        clock.addAndGet(WINDOW + 1);

        // Still broken a minute later is worth knowing; silence for ever is not.
        assertThat(t.admit("Handler|NullPointerException").send()).isTrue();
    }

    @Test
    @DisplayName("distinct errors are all sent, up to the per-window ceiling")
    void distinctErrorsPassUntilTheCeiling() {
        LogThrottle t = throttle();

        for (int i = 0; i < CAP; i++) {
            assertThat(t.admit("Handler|Error" + i).send())
                    .as("error %d is within the cap", i).isTrue();
        }
        // Dedup would let this one through — the ceiling is what stops it.
        assertThat(t.admit("Handler|ErrorBeyondCap").send()).isFalse();
    }

    @Test
    @DisplayName("the count of what was dropped is reported once, on the next window")
    void theSuppressedCountIsReportedOnce() {
        LogThrottle t = throttle();
        for (int i = 0; i < CAP + 5; i++) {
            t.admit("Handler|Error" + i);
        }

        clock.addAndGet(WINDOW + 1);
        LogThrottle.Verdict first = t.admit("Handler|Fresh");

        // Silently dropping is how a flood hides. One line saying how much was
        // dropped is the difference between "quiet" and "quiet because we
        // stopped talking".
        assertThat(first.suppressed()).isEqualTo(5);
        assertThat(t.admit("Handler|Another").suppressed())
                .as("reported once, not on every later event").isZero();
    }

    @Test
    @DisplayName("the ceiling resets when the window rolls")
    void theCeilingResets() {
        LogThrottle t = throttle();
        for (int i = 0; i < CAP + 5; i++) {
            t.admit("Handler|Error" + i);
        }

        clock.addAndGet(WINDOW + 1);

        assertThat(t.admit("Handler|AfterTheWindow").send()).isTrue();
    }

    @Test
    @DisplayName("the dedup table cannot grow without bound")
    void theDedupTableIsBounded() {
        // A key built from a message containing a UUID would otherwise add a
        // row per error for ever — a memory leak inside the thing meant to
        // protect us.
        LogThrottle t = new LogThrottle(Integer.MAX_VALUE, WINDOW, WINDOW, 100, clock::get);

        for (int i = 0; i < 1_000; i++) {
            t.admit("Handler|unique-" + i);
        }

        assertThat(t.trackedKeys()).isLessThanOrEqualTo(100);
    }
}
