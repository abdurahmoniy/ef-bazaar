package uz.efbazaar.outbox.internal;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.serialization.Serializer;
import org.springframework.beans.BeanUtils;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.util.ClassUtils;

import java.util.Map;

/**
 * Payload'ni servisning O'ZI sozlagan value serializer bilan kodlaydi.
 *
 * <p>Maqsad — relay yuboradigan xabar hozirgi {@code kafkaTemplate.send} chiqaradigan
 * xabar bilan bayt-ma-bayt bir xil bo'lishi: consumer'lar outbox'ga o'tilganini sezmasin.
 * Shuning uchun serializer servisning {@link ProducerFactory} sidan olinadi — instansiya
 * berilgan bo'lsa o'sha, bo'lmasa sozlamadagi klass o'sha sozlamalar bilan.
 */
public class MessageEncoder {

    private final Serializer<Object> serializer;

    public MessageEncoder(ProducerFactory<?, ?> producerFactory) {
        this.serializer = resolve(producerFactory);
    }

    public EncodedMessage encode(String topic, Object payload) {
        RecordHeaders headers = new RecordHeaders();
        byte[] bytes = serializer.serialize(topic, headers, payload);
        return new EncodedMessage(bytes, HeaderCodec.toJson(headers));
    }

    @SuppressWarnings("unchecked")
    private static Serializer<Object> resolve(ProducerFactory<?, ?> pf) {
        // Factory serializer INSTANSIYASI bilan qurilgan bo'lsa — aynan o'sha (maxsus ObjectMapper va h.k.).
        Serializer<?> instance = pf.getValueSerializer();
        if (instance != null) {
            return (Serializer<Object>) instance;
        }
        Map<String, Object> config = pf.getConfigurationProperties();
        Object configured = config.get(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG);
        if (configured == null) {
            throw new IllegalStateException("spring.kafka.producer.value-serializer sozlanmagan");
        }
        Class<?> type = configured instanceof Class<?> c
                ? c
                : ClassUtils.resolveClassName(configured.toString(), MessageEncoder.class.getClassLoader());
        Serializer<Object> serializer = (Serializer<Object>) BeanUtils.instantiateClass(type);
        serializer.configure(config, false);
        return serializer;
    }
}
