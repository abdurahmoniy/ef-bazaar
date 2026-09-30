package uz.efbazaar.outbox.internal;

import org.apache.kafka.common.header.Header;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/** Relay'ning Kafka bilan yagona aloqasi — testda almashtirish uchun interfeys. */
public interface OutboxSender {

    CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers);
}
