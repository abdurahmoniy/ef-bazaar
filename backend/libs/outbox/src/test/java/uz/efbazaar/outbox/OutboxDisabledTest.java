package uz.efbazaar.outbox;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxDisabledTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(DataSourceAutoConfiguration.class,
                    JdbcTemplateAutoConfiguration.class, KafkaAutoConfiguration.class,
                    OutboxAutoConfiguration.class))
            .withPropertyValues("spring.datasource.url=jdbc:postgresql://localhost:1/none",
                    "spring.kafka.producer.value-serializer=org.springframework.kafka.support.serializer.JsonSerializer");

    @Test
    void noBeansWhenDisabled() {
        runner.withPropertyValues("outbox.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(Outbox.class));
    }

    @Test
    void noBeansWithoutKafkaProducerFactory() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(DataSourceAutoConfiguration.class,
                        JdbcTemplateAutoConfiguration.class, OutboxAutoConfiguration.class))
                .withPropertyValues("spring.datasource.url=jdbc:postgresql://localhost:1/none")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).doesNotHaveBean(Outbox.class);
                });
    }
}
