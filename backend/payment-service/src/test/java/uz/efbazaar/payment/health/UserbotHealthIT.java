package uz.efbazaar.payment.health;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.testsupport.ClockTestConfig;
import uz.efbazaar.payment.testsupport.MutableClock;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(ClockTestConfig.class)
class UserbotHealthIT extends AbstractPostgresIT {

    @Autowired UserbotHealth health;
    @Autowired MutableClock clock;

    /**
     * UserbotHealth is a singleton shared across every test in this class
     * (and, once the Spring context is cached, across other test classes in
     * the same run) — so each test resets the clock to a known baseline
     * rather than trusting whatever a previous test left it at. Because real
     * heartbeats are always fresher than anything a previous test recorded,
     * this reset is enough to make the class order-independent: proven by
     * running it under both normal and reverse-alphabetical failsafe order.
     */
    @BeforeEach
    void resetClock() {
        clock.reset(Instant.now());
    }

    @Test
    void aFreshHeartbeatIsHealthy() {
        health.record(clock.instant());
        assertThat(health.isHealthy()).isTrue();
        assertThat(health.lastSeenAt()).isPresent();
    }

    @Test
    void aStaleHeartbeatIsNotHealthy() {
        health.record(clock.instant());
        clock.advance(Duration.ofHours(1));

        assertThat(health.isHealthy()).isFalse();
    }

    @Test
    void anOlderHeartbeatNeverOverwritesANewerOne() {
        Instant fresh = clock.instant();
        health.record(fresh);
        health.record(fresh.minus(Duration.ofHours(1)));

        assertThat(health.isHealthy())
                .as("a delayed heartbeat must not un-heal a live userbot")
                .isTrue();
    }

    /**
     * Not exercised through the shared autowired bean — once anything in the
     * suite calls record(), the monotonic guard means lastSeen can never go
     * back to null. A freshly constructed instance is the only way to see
     * the true boot state: what every fresh deployment starts in, before
     * anything has proven it is watching the bank feed.
     */
    @Test
    void neverHavingReceivedAHeartbeatIsUnhealthy() {
        UserbotHealth fresh = new UserbotHealth(clock, 180);

        assertThat(fresh.lastSeenAt()).isEmpty();
        assertThat(fresh.isHealthy())
                .as("a service that just booted has not proven anything is watching the bank feed yet")
                .isFalse();
    }
}
