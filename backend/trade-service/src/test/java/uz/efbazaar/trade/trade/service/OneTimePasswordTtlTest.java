package uz.efbazaar.trade.trade.service;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The reveal key has to still be there when the deadline the party was shown
 * runs out.
 *
 * <p>It used to sit in Redis for a fixed 30 minutes while WAITING_BUYER_VERIFY
 * gives the party 24 hours — and the panel counts those hours down on screen.
 * Anyone who did not open it inside the first half hour was told the password
 * had already been revealed or expired, and by design nothing recovers it after
 * that: not an admin, not the master key. They had already handed their own
 * account over, and the state machine has no way to send it again.
 *
 * <p>A plain unit test on purpose. The version that asserted this against a
 * running context needed its own {@code @TestPropertySource} to get a window
 * longer than the two seconds the shared test profile uses, and a second Spring
 * context costs a second connection pool — the suite fell over on "too many
 * clients". This asks the same question of the same arithmetic for nothing.
 */
class OneTimePasswordTtlTest {

    private static long ttlFor(long windowSeconds) {
        OneTimePasswordService service = new OneTimePasswordService(null, null, null, null, null);
        ReflectionTestUtils.setField(service, "revealWindowSeconds", windowSeconds);
        return service.revealTtlSeconds();
    }

    @Test
    void theKeyOutlivesTheWindowTheUserIsShown() {
        // The real setting: waiting-buyer-verify-seconds is a day.
        assertThat(ttlFor(86_400))
                .as("a key that expires first takes the account with it")
                .isGreaterThan(86_400);
    }

    @Test
    void itFollowsTheSettingRatherThanAFixedNumber() {
        // The two drifting apart is what caused this; tracking the setting is
        // what stops them drifting again.
        assertThat(ttlFor(200_000)).isGreaterThan(200_000);
        assertThat(ttlFor(60)).isGreaterThan(60);
    }
}
