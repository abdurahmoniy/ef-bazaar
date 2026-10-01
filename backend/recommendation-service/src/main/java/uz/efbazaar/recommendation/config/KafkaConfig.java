package uz.efbazaar.recommendation.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.KafkaException;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.listener.ConsumerRecordRecoverer;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.ExponentialBackOff;

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

        return errorHandler(new DeadLetterPublishingRecoverer(deadLetters, (record, ex) -> deadLetterFor(record)));
    }

    /**
     * Ikki xil xato, ikki xil yo'l. Buzilgan yoki noto'g'ri xabar (JSON o'qilmadi, kalit yo'q,
     * ustun cheklovi) qayta urinishda tuzalmaydi — darhol DLT. Qolgani (DB yoki tarmoq uzilishi)
     * vaqtinchalik: to'g'ri snapshot DLT'ga tushib, hech kim o'qimaydigan joyda yo'qolmasin —
     * 1 s dan 60 s gacha o'sib, cheksiz qayta uriniladi. Partition shu orada kutadi, tartib saqlanadi.
     */
    static DefaultErrorHandler errorHandler(ConsumerRecordRecoverer recoverer) {
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, retryBackOff());
        handler.addNotRetryableExceptions(JsonProcessingException.class, IllegalArgumentException.class,
                DataIntegrityViolationException.class);
        handler.setLogLevel(KafkaException.Level.ERROR);
        return handler;
    }

    static BackOff retryBackOff() {
        ExponentialBackOff backOff = new ExponentialBackOff(1_000L, 2.0);
        backOff.setMaxInterval(60_000L);
        backOff.setMaxElapsedTime(Long.MAX_VALUE);
        return backOff;
    }

    /** Partition -1 — broker tanlaydi (DLT'da partition kamroq bo'lishi mumkin). */
    static TopicPartition deadLetterFor(ConsumerRecord<?, ?> record) {
        return new TopicPartition(record.topic() + DLT_SUFFIX, -1);
    }
}
