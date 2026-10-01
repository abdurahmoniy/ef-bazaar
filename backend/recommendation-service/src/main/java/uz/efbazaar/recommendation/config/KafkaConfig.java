package uz.efbazaar.recommendation.config;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.KafkaException;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

import java.util.HashMap;
import java.util.Map;

/**
 * O'qib yoki yozib bo'lmagan xabar bitta offset'ga tushadi va {@code <topic>.DLT} ga
 * ketadi — consumer o'sha xabarni cheksiz qayta o'qimaydi (marketplace
 * {@code KafkaErrorHandlingConfig} bilan bir xil saboq).
 */
@Configuration
public class KafkaConfig {

    public static final String DLT_SUFFIX = ".DLT";

    @Bean
    DefaultErrorHandler kafkaErrorHandler(ProducerFactory<?, ?> producerFactory) {
        // Xom matnni o'zgarishsiz yozish uchun alohida String template (servisniki JsonSerializer).
        Map<String, Object> config = new HashMap<>(producerFactory.getConfigurationProperties());
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        KafkaTemplate<String, String> deadLetters = new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(config));

        DeadLetterPublishingRecoverer recoverer =
                new DeadLetterPublishingRecoverer(deadLetters, (record, ex) -> deadLetterFor(record));
        // Uch urinish soniya oralig'ida: DB'dagi qisqa uzilish uchun yetarli, buzilgan JSON
        // o'ninchi urinishda ham tuzalmaydi.
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, new FixedBackOff(1_000L, 2));
        handler.setLogLevel(KafkaException.Level.ERROR);
        return handler;
    }

    /** Partition -1 — broker tanlaydi (DLT'da partition kamroq bo'lishi mumkin). */
    static TopicPartition deadLetterFor(ConsumerRecord<?, ?> record) {
        return new TopicPartition(record.topic() + DLT_SUFFIX, -1);
    }
}
