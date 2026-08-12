package uz.efbazaar.payment.testsupport;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Clock;

/**
 * Swaps the production {@code Clock.systemUTC()} bean for a {@link MutableClock}
 * a test can advance. Import into any {@code @SpringBootTest} that needs to
 * drive {@code UserbotHealth} across its heartbeat timeout without sleeping.
 */
@TestConfiguration
public class ClockTestConfig {

    @Bean
    @Primary
    public MutableClock mutableClock() {
        return new MutableClock();
    }
}
