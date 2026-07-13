package uz.efbazaar.trade.kafka;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import static org.apache.kafka.clients.consumer.ConsumerConfig.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class TradeEventPublisherIT extends AbstractIntegrationIT {

    @Autowired
    private TradeEventPublisher publisher;

    @Test
    void proposalCreatedRoundTrip() {
        UUID proposalId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID proposer = UUID.randomUUID();

        publisher.proposalCreated(proposalId, chatId, proposer, 500_000L);

        try (Consumer<String, TradeEvents.ProposalCreated> consumer = consumer()) {
            consumer.subscribe(java.util.List.of(TradeEvents.TOPIC_PROPOSAL_CREATED));
            ConsumerRecords<String, TradeEvents.ProposalCreated> polled =
                    consumer.poll(Duration.ofSeconds(5));
            assertThat(polled.count()).isGreaterThan(0);
            ConsumerRecord<String, TradeEvents.ProposalCreated> r = polled.iterator().next();
            assertThat(r.key()).isEqualTo(proposalId.toString());
            assertThat(r.value().proposalId()).isEqualTo(proposalId);
            assertThat(r.value().amountUzs()).isEqualTo(500_000L);
        }
    }

    private Consumer<String, TradeEvents.ProposalCreated> consumer() {
        Map<String, Object> props = Map.of(
                BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                GROUP_ID_CONFIG, "test-" + UUID.randomUUID(),
                AUTO_OFFSET_RESET_CONFIG, "earliest",
                KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class,
                JsonDeserializer.TRUSTED_PACKAGES, "uz.efbazaar.*",
                JsonDeserializer.VALUE_DEFAULT_TYPE, TradeEvents.ProposalCreated.class.getName());
        return new DefaultKafkaConsumerFactory<String, TradeEvents.ProposalCreated>(props)
                .createConsumer();
    }
}
