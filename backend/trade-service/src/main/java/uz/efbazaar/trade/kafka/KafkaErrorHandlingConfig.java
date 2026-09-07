package uz.efbazaar.trade.kafka;

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
 * <p>trade-service ran without this for its whole life, and on 2026-09-07 it
 * cost an outage. auth-service published one {@code user-role-changed} record
 * whose {@code __TypeId__} header named a class trade-service does not have.
 * The failure happened inside {@code poll()}, so the offset was never
 * committed and the container re-polled the same record at full speed:
 * 669,000 log lines a minute, trade-service at 1.5 cores, the log shipper at
 * another 1.6, and a 96 GB disk on course to fill within the day. Nothing
 * about the trade lifecycle was broken — it was one unreadable record with
 * nowhere to go.
 *
 * <p>Two things had to change and they fix different halves. Making that
 * record readable (see {@link UserRoleChangedConsumer}) fixes this record.
 * This bean fixes the next one: whatever arrives that we cannot parse costs a
 * single offset and lands on a DLT instead of taking the service down.
 *
 * <p>Pairs with {@code ErrorHandlingDeserializer} in {@code application.yml} —
 * the handler can only act on a deserialisation failure that was wrapped into
 * the record rather than thrown out of {@code poll()}. One without the other
 * leaves the loop intact. Copied deliberately from payment-service, which
 * learned the same lesson on its heartbeat topic.
 */
@Slf4j
@Configuration
public class KafkaErrorHandlingConfig {

    /** Appended to the source topic name to get its dead-letter topic. */
    public static final String DLT_SUFFIX = ".DLT";

    @Bean
    DefaultErrorHandler kafkaErrorHandler(KafkaTemplate<String, Object> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template,
                // Partition -1 lets the broker choose. The default resolver reuses
                // the source partition number, which fails outright if the DLT has
                // fewer partitions than the source topic.
                (record, ex) -> new TopicPartition(record.topic() + DLT_SUFFIX, -1));

        // Three attempts a second apart, not the default ten back to back. A
        // transient database blip deserves a retry; a record we cannot parse
        // will not parse better on the tenth try.
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, new FixedBackOff(1_000L, 2));
        handler.setLogLevel(org.springframework.kafka.KafkaException.Level.ERROR);
        return handler;
    }
}
