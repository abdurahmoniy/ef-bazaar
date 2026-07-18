package uz.efbazaar.trade.mail;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.config.MailProperties;
import uz.efbazaar.trade.mail.service.MailRateLimiter;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MailRateLimiterTest {

    /** Fixed wall clock so the tests never straddle a second boundary. */
    private static final Clock FIXED = Clock.fixed(
            Instant.parse("2026-07-18T12:00:00Z"), ZoneOffset.UTC);

    private static MailProperties props(int perSecond) {
        return new MailProperties(
                new MailProperties.Imap("mail.example", 993, 10_000, 15_000, 300, 60),
                new MailProperties.RateLimit(perSecond));
    }

    private static MailRateLimiter limiter(int perSecond) {
        return new MailRateLimiter(props(perSecond), FIXED);
    }

    @Test
    void allowsRequestsUpToTheLimit() {
        MailRateLimiter rl = limiter(3);
        UUID u = UUID.randomUUID();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isTrue();
    }

    @Test
    void rejectsWhenLimitExceeded() {
        MailRateLimiter rl = limiter(2);
        UUID u = UUID.randomUUID();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isFalse();
    }

    @Test
    void isolatesUsers() {
        MailRateLimiter rl = limiter(1);
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        assertThat(rl.tryAcquire(a)).isTrue();
        assertThat(rl.tryAcquire(a)).isFalse();
        // b's bucket is separate
        assertThat(rl.tryAcquire(b)).isTrue();
    }
}
