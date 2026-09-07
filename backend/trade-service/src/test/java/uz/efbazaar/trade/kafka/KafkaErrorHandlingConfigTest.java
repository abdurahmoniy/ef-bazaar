package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DefaultErrorHandler;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Without a {@link CommonErrorHandler} bean, a record this service cannot read
 * is not merely dropped — the offset is never committed and the container
 * re-polls it for ever. That is what took trade-service to 1.5 cores and
 * 669,000 log lines a minute on 2026-09-07.
 *
 * <p>payment-service already carries this bean for the same reason. This test
 * is here so trade-service cannot quietly lose it again.
 */
class KafkaErrorHandlingConfigTest {

    @Test
    @DisplayName("the listener containers get an error handler that can move past a bad record")
    void anErrorHandlerIsRegistered() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(KafkaAutoConfiguration.class))
                .withUserConfiguration(KafkaErrorHandlingConfig.class)
                .run(context -> assertThat(context).hasSingleBean(DefaultErrorHandler.class));
    }
}
