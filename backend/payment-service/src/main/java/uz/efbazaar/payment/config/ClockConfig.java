package uz.efbazaar.payment.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * Real wall-clock time in production. Tests substitute a mutable {@link Clock}
 * so "the userbot went quiet" can be modeled by advancing time forward — the
 * way staleness actually happens — instead of rewinding a recorded timestamp,
 * which never occurs in production and which {@code UserbotHealth}'s
 * monotonic guard exists specifically to reject.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
