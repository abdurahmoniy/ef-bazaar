package uz.efbazaar.trade.mail;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.config.MailProperties;
import uz.efbazaar.trade.mail.service.MailRateLimiter;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MailRateLimiterTest {

    private static MailProperties props(int perSecond) {
        return new MailProperties(
                new MailProperties.Imap("mail.example", 993, 10_000, 15_000, 300, 60),
                new MailProperties.RateLimit(perSecond));
    }

    @Test
    void allowsRequestsUpToTheLimit() {
        MailRateLimiter rl = new MailRateLimiter(props(3));
        UUID u = UUID.randomUUID();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isTrue();
    }

    @Test
    void rejectsWhenLimitExceeded() {
        MailRateLimiter rl = new MailRateLimiter(props(2));
        UUID u = UUID.randomUUID();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isTrue();
        assertThat(rl.tryAcquire(u)).isFalse();
    }

    @Test
    void isolatesUsers() {
        MailRateLimiter rl = new MailRateLimiter(props(1));
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        assertThat(rl.tryAcquire(a)).isTrue();
        assertThat(rl.tryAcquire(a)).isFalse();
        // b's bucket is separate
        assertThat(rl.tryAcquire(b)).isTrue();
    }
}
