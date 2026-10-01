package uz.efbazaar.recommendation.config;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

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
}
