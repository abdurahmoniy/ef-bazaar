package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Tayyor baytlarni yuboradi. Servis producer sozlamalarini (bootstrap, xavfsizlik) oladi,
 * lekin serializer'lar bayt uchun almashtiriladi va idempotentlik yoqiladi —
 * bir partition ichida tartib qayta urinishlarda ham saqlansin.
 */
public class KafkaOutboxSender implements OutboxSender {

    private final DefaultKafkaProducerFactory<String, byte[]> factory;
    private final KafkaTemplate<String, byte[]> template;

    public KafkaOutboxSender(ProducerFactory<?, ?> servicePf, Duration sendTimeout) {
        this.factory = new DefaultKafkaProducerFactory<>(producerProperties(servicePf, sendTimeout),
                new StringSerializer(), new ByteArraySerializer());
        this.template = new KafkaTemplate<>(factory);
    }

    static Map<String, Object> producerProperties(ProducerFactory<?, ?> servicePf, Duration sendTimeout) {
        Map<String, Object> props = new HashMap<>(servicePf.getConfigurationProperties());
        props.remove(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG);
        props.remove(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG);
        props.remove(ProducerConfig.TRANSACTIONAL_ID_CONFIG);
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        // send() o'zi metadata yoki bufer kutib bloklanishi mumkin (default 60 s) — relay
        // shu vaqt DB qulflarini ushlab turadi. Chegarani send-timeout bilan tenglashtiramiz.
        props.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, sendTimeout.toMillis());
        return props;
    }

    @Override
    public CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers) {
        return template.send(new ProducerRecord<>(topic, null, key, payload, headers));
    }

    public void destroy() {
        factory.destroy();
    }
}
