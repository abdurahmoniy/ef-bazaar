package uz.efbazaar.payment.kafka;

import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.common.TopicPartition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

/**
 * Where a record this service cannot process goes to die — visibly.
 *
 * <p>Without a {@code CommonErrorHandler} bean Spring Kafka falls back to a
 * {@link DefaultErrorHandler} that has no recoverer: it retries ten times, logs
 * once, seeks past the record and commits the offset. For the heartbeat topic
 * that is survivable, because a missing heartbeat only refuses new deposits.
 * For {@code card-credit-observed} it is not: every record there is money the
 * platform physically received, and skipping one leaves no observation row, no
 * admin queue entry and no alert — the whole "queue it for a human" promise has
 * a hole in it exactly where the record is unreadable.
 *
 * <p>Boot picks this bean up automatically and applies it to every listener
 * container, so both topics get the same treatment.
 */
@Slf4j
@Configuration
public class KafkaErrorHandlingConfig {

    /**
     * The template is the app's own producer (String key, JSON value), so a
     * parked record lands on the DLT in the same shape it would have had on the
     * main topic. A record that failed to deserialise carries its raw bytes
     * instead, which the recoverer forwards verbatim.
     *
     * @param template autowired by type exactly as {@link PaymentEventPublisher}
     *                 does
     */
    @Bean
    DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template,
                // Partition -1 lets the broker choose. The default resolver
                // reuses the source partition number, which fails outright if
                // the DLT ever has fewer partitions than the source topic.
                (record, ex) -> new TopicPartition(record.topic() + PaymentTopics.DLT_SUFFIX, -1));

        // Three attempts a second apart, not the default ten back to back: a
        // transient database blip deserves a retry, a malformed record does not
        // deserve thirty seconds of the consumer's attention.
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, new FixedBackOff(1_000L, 2));
        // Nothing about a missing NOT NULL field improves on the second try.
        handler.addNotRetryableExceptions(MalformedCardCreditException.class);
        handler.setLogLevel(org.springframework.kafka.KafkaException.Level.ERROR);
        return handler;
    }
}
