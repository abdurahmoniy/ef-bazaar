package uz.efbazaar.trade.plan.service;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import java.time.Clock;
@Configuration
public class MailboxClockConfiguration {
    @Bean @ConditionalOnMissingBean(Clock.class)
    Clock mailboxClock() { return Clock.systemUTC(); }
}
