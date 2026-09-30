package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class KafkaOutboxSenderTest {

    @Test
    void producerNeverBlocksLongerThanSendTimeout() {
        DefaultKafkaProducerFactory<String, Object> pf = new DefaultKafkaProducerFactory<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:1",
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class,
                ProducerConfig.MAX_BLOCK_MS_CONFIG, 60_000));

        Map<String, Object> props = KafkaOutboxSender.producerProperties(pf, Duration.ofSeconds(3));

        assertThat(props.get(ProducerConfig.MAX_BLOCK_MS_CONFIG)).isEqualTo(3_000L);
        assertThat(props.get(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG)).isEqualTo(true);
        assertThat(props).doesNotContainKeys(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG);
    }
}
