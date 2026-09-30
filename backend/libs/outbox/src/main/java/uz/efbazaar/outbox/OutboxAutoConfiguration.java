package uz.efbazaar.outbox;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.autoconfigure.transaction.TransactionAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.internal.DefaultOutbox;
import uz.efbazaar.outbox.internal.KafkaOutboxSender;
import uz.efbazaar.outbox.internal.MessageEncoder;
import uz.efbazaar.outbox.internal.OutboxCleanup;
import uz.efbazaar.outbox.internal.OutboxMetrics;
import uz.efbazaar.outbox.internal.OutboxRelay;
import uz.efbazaar.outbox.internal.OutboxRepository;
import uz.efbazaar.outbox.internal.OutboxSender;

@AutoConfiguration(after = {JdbcTemplateAutoConfiguration.class, KafkaAutoConfiguration.class,
        TransactionAutoConfiguration.class})
@ConditionalOnProperty(prefix = "outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
@ConditionalOnBean(JdbcTemplate.class)
@EnableConfigurationProperties(OutboxProperties.class)
@EnableScheduling
public class OutboxAutoConfiguration {

    @Bean
    OutboxRepository outboxRepository(JdbcTemplate jdbc) {
        return new OutboxRepository(jdbc);
    }

    @Bean
    MessageEncoder outboxMessageEncoder(ProducerFactory<?, ?> producerFactory) {
        return new MessageEncoder(producerFactory);
    }

    @Bean(destroyMethod = "destroy")
    @ConditionalOnMissingBean(OutboxSender.class)
    KafkaOutboxSender outboxSender(ProducerFactory<?, ?> producerFactory) {
        return new KafkaOutboxSender(producerFactory);
    }

    @Bean(initMethod = "start", destroyMethod = "shutdown")
    OutboxRelay outboxRelay(OutboxRepository repo, OutboxSender sender, PlatformTransactionManager txManager,
                            OutboxProperties props, ObjectProvider<SnapshotSource> sources,
                            MessageEncoder encoder, ObjectProvider<MeterRegistry> registry) {
        return new OutboxRelay(repo, sender, new TransactionTemplate(txManager), props,
                sources.orderedStream().toList(), encoder,
                registry.getIfAvailable(SimpleMeterRegistry::new));
    }

    @Bean
    Outbox outbox(OutboxRepository repo, MessageEncoder encoder, OutboxRelay relay) {
        return new DefaultOutbox(repo, encoder, relay::wake);
    }

    @Bean
    OutboxCleanup outboxCleanup(OutboxRepository repo, OutboxProperties props) {
        return new OutboxCleanup(repo, props);
    }

    @Bean
    OutboxMetrics outboxMetrics(OutboxRepository repo) {
        return new OutboxMetrics(repo);
    }
}
