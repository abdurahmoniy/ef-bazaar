package uz.efbazaar.recommendation.config;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringSerializer;
import com.fasterxml.jackson.core.JsonParseException;
import org.apache.kafka.clients.consumer.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.listener.ListenerExecutionFailedException;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.BackOffExecution;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class KafkaConfigTest {

    @Test
    void deadLetterGoesToSameTopicWithDltSuffixOnAnyPartition() {
        TopicPartition target = KafkaConfig.deadLetterFor(
                new ConsumerRecord<>("efbazaar.marketplace.listing-snapshot", 3, 10L, "k", "v"));

        assertThat(target.topic()).isEqualTo("efbazaar.marketplace.listing-snapshot.DLT");
        assertThat(target.partition()).isEqualTo(-1);
    }

    @Test
    void errorHandlerBuildsFromTheServiceProducerFactory() {
        var factory = new DefaultKafkaProducerFactory<String, Object>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092",
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class));

        assertThat(new KafkaConfig().kafkaErrorHandler(factory)).isNotNull();
    }

    private final List<ConsumerRecord<?, ?>> deadLettered = new ArrayList<>();
    private final DefaultErrorHandler handler = KafkaConfig.errorHandler((record, ex) -> deadLettered.add(record));
    private final ConsumerRecord<String, String> record =
            new ConsumerRecord<>("efbazaar.marketplace.listing-snapshot", 0, 5L, "k", "v");

    private boolean fail(Exception cause) {
        return handler.handleOne(new ListenerExecutionFailedException("listener", cause), record,
                mock(Consumer.class), mock(MessageListenerContainer.class));
    }

    /** Buzilgan xabar qayta urinishda tuzalmaydi — darhol DLT. */
    @Test
    void unreadableOrInvalidMessagesGoStraightToTheDeadLetterTopic() {
        assertThat(fail(new JsonParseException(null, "bad"))).isTrue();
        assertThat(fail(new IllegalArgumentException("idempotencyKey bo'sh"))).isTrue();
        assertThat(fail(new DataIntegrityViolationException("null status"))).isTrue();
        assertThat(deadLettered).hasSize(3);
    }

    /** DB uzilishi: to'g'ri snapshot DLT'ga ketib yo'qolmasin — qayta urinish davom etadi. */
    @Test
    void transientFailuresAreRetriedInsteadOfDeadLettered() {
        for (int i = 0; i < 5; i++) {
            assertThat(fail(new DataAccessResourceFailureException("db down"))).isFalse();
        }
        assertThat(deadLettered).isEmpty();
    }

    @Test
    void retryBackOffNeverGivesUpAndIsCappedAtOneMinute() {
        BackOffExecution execution = KafkaConfig.retryBackOff().start();
        long last = 0;
        for (int i = 0; i < 1000; i++) {
            last = execution.nextBackOff();
            assertThat(last).isNotEqualTo(BackOffExecution.STOP);
        }
        assertThat(last).isEqualTo(60_000L);
    }
}
