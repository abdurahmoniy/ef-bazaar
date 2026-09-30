package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class MessageEncoderTest {

    public record Sample(String name, int n) {}

    @Test
    void usesSerializerConfiguredByClassName() {
        DefaultKafkaProducerFactory<String, Object> pf = new DefaultKafkaProducerFactory<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:1",
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class));

        EncodedMessage encoded = new MessageEncoder(pf).encode("t", new Sample("a", 1));

        RecordHeaders expectedHeaders = new RecordHeaders();
        byte[] expected;
        try (JsonSerializer<Object> reference = new JsonSerializer<>()) {
            expected = reference.serialize("t", expectedHeaders, new Sample("a", 1));
        }
        assertThat(encoded.payload()).isEqualTo(expected);
        assertThat(HeaderCodec.fromJson(encoded.headersJson())).extracting(Header::key)
                .containsExactly("__TypeId__");
        assertThat(new String(HeaderCodec.fromJson(encoded.headersJson()).get(0).value(), StandardCharsets.UTF_8))
                .isEqualTo(Sample.class.getName());
    }

    @Test
    void usesSerializerInstanceWhenFactoryHasOne() {
        JsonSerializer<Object> custom = new JsonSerializer<>();
        custom.setAddTypeInfo(false);
        DefaultKafkaProducerFactory<String, Object> pf = new DefaultKafkaProducerFactory<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:1"),
                new StringSerializer(), custom);

        EncodedMessage encoded = new MessageEncoder(pf).encode("t", new Sample("a", 1));

        assertThat(HeaderCodec.fromJson(encoded.headersJson())).isEmpty();
        assertThat(new String(encoded.payload(), StandardCharsets.UTF_8)).isEqualTo("{\"name\":\"a\",\"n\":1}");
    }
}
