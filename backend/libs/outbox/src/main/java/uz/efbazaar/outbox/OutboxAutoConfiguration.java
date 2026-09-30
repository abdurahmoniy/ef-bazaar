package uz.efbazaar.outbox;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.outbox.internal.DefaultOutbox;
import uz.efbazaar.outbox.internal.MessageEncoder;
import uz.efbazaar.outbox.internal.OutboxRepository;

@AutoConfiguration(after = {JdbcTemplateAutoConfiguration.class, KafkaAutoConfiguration.class})
@ConditionalOnProperty(prefix = "outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
@ConditionalOnBean(JdbcTemplate.class)
@EnableConfigurationProperties(OutboxProperties.class)
public class OutboxAutoConfiguration {

    @Bean
    OutboxRepository outboxRepository(JdbcTemplate jdbc) {
        return new OutboxRepository(jdbc);
    }

    @Bean
    MessageEncoder outboxMessageEncoder(org.springframework.kafka.core.ProducerFactory<?, ?> producerFactory) {
        return new MessageEncoder(producerFactory);
    }

    @Bean
    Outbox outbox(OutboxRepository repo, MessageEncoder encoder) {
        return new DefaultOutbox(repo, encoder, () -> { });
    }
}
