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
import uz.efbazaar.trade.trade.domain.Trade;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;

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

        // The topic is shared with TradeProposalService(IT|ControllerIT), which may
        // have already published unrelated proposals to the reused Kafka container,
        // so match on this test's proposalId rather than assuming the first record is ours.
        try (Consumer<String, TradeEvents.ProposalCreated> consumer =
                     consumer(TradeEvents.ProposalCreated.class)) {
            consumer.subscribe(List.of(TradeEvents.TOPIC_PROPOSAL_CREATED));
            ConsumerRecord<String, TradeEvents.ProposalCreated> r =
                    pollUntil(consumer, v -> v.proposalId().equals(proposalId));

            assertThat(r).as("record for proposalId %s", proposalId).isNotNull();
            assertThat(r.key()).isEqualTo(proposalId.toString());
            assertThat(r.value().proposalId()).isEqualTo(proposalId);
            assertThat(r.value().amountUzs()).isEqualTo(500_000L);
        }
    }

    @Test
    void tradeOpenedRoundTrip() {
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        Trade trade = Trade.builder().id(tradeId).chatId(chatId).build();

        publisher.tradeOpened(trade);

        try (Consumer<String, TradeEvents.TradeChatPin> consumer =
                     consumer(TradeEvents.TradeChatPin.class)) {
            consumer.subscribe(List.of(TradeEvents.TOPIC_TRADE_OPENED));
            ConsumerRecord<String, TradeEvents.TradeChatPin> r =
                    pollUntil(consumer, v -> v.tradeId().equals(tradeId));

            assertThat(r).as("record for tradeId %s", tradeId).isNotNull();
            assertThat(r.key()).isEqualTo(tradeId.toString());
            assertThat(r.value().chatId()).isEqualTo(chatId);
        }
    }

    @Test
    void tradeClosedRoundTrip() {
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        Trade trade = Trade.builder().id(tradeId).chatId(chatId).build();

        publisher.tradeClosed(trade);

        try (Consumer<String, TradeEvents.TradeChatPin> consumer =
                     consumer(TradeEvents.TradeChatPin.class)) {
            consumer.subscribe(List.of(TradeEvents.TOPIC_TRADE_CLOSED));
            ConsumerRecord<String, TradeEvents.TradeChatPin> r =
                    pollUntil(consumer, v -> v.tradeId().equals(tradeId));

            assertThat(r).as("record for tradeId %s", tradeId).isNotNull();
            assertThat(r.key()).isEqualTo(tradeId.toString());
            assertThat(r.value().chatId()).isEqualTo(chatId);
        }
    }

    /**
     * Polls (with retries) until a record whose value matches {@code matches}
     * shows up, rather than assuming the first polled record is ours — these
     * topics are shared across several IT classes on the same reused Kafka
     * container.
     */
    private <T> ConsumerRecord<String, T> pollUntil(Consumer<String, T> consumer, Predicate<T> matches) {
        ConsumerRecord<String, T> r = null;
        long deadline = System.currentTimeMillis() + Duration.ofSeconds(10).toMillis();
        while (r == null && System.currentTimeMillis() < deadline) {
            ConsumerRecords<String, T> polled = consumer.poll(Duration.ofSeconds(2));
            for (ConsumerRecord<String, T> record : polled) {
                if (matches.test(record.value())) {
                    r = record;
                    break;
                }
            }
        }
        return r;
    }

    private <T> Consumer<String, T> consumer(Class<T> valueType) {
        Map<String, Object> props = Map.of(
                BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                GROUP_ID_CONFIG, "test-" + UUID.randomUUID(),
                AUTO_OFFSET_RESET_CONFIG, "earliest",
                KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class,
                JsonDeserializer.TRUSTED_PACKAGES, "uz.efbazaar.*",
                JsonDeserializer.VALUE_DEFAULT_TYPE, valueType.getName());
        return new DefaultKafkaConsumerFactory<String, T>(props).createConsumer();
    }
}
