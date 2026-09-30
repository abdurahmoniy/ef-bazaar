package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.errors.InvalidTopicException;
import org.apache.kafka.common.errors.RecordTooLargeException;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.errors.TimeoutException;
import org.apache.kafka.common.errors.TopicAuthorizationException;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaProducerException;

import java.util.Set;
import java.util.concurrent.ExecutionException;

import static org.assertj.core.api.Assertions.assertThat;

class PermanentFailuresTest {

    @Test
    void recognisesPermanentKafkaErrorsEvenWhenWrapped() {
        ProducerRecord<String, byte[]> record = new ProducerRecord<>("t", new byte[0]);
        assertThat(PermanentFailures.isPermanent(new RecordTooLargeException("x"))).isTrue();
        assertThat(PermanentFailures.isPermanent(new ExecutionException(
                new KafkaProducerException(record, "send failed", new RecordTooLargeException("x"))))).isTrue();
        assertThat(PermanentFailures.isPermanent(new InvalidTopicException("x"))).isTrue();
        assertThat(PermanentFailures.isPermanent(new TopicAuthorizationException(Set.of("t")))).isTrue();
        assertThat(PermanentFailures.isPermanent(new SerializationException("x"))).isTrue();
    }

    @Test
    void transientErrorsAreNotPermanent() {
        assertThat(PermanentFailures.isPermanent(new TimeoutException("x"))).isFalse();
        assertThat(PermanentFailures.isPermanent(new java.util.concurrent.TimeoutException())).isFalse();
        assertThat(PermanentFailures.isPermanent(new IllegalStateException("broker down"))).isFalse();
        assertThat(PermanentFailures.isPermanent(null)).isFalse();
    }
}
