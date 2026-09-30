package uz.efbazaar.outbox.it;

import org.apache.kafka.common.header.Header;
import uz.efbazaar.outbox.internal.OutboxSender;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

/** Haqiqiy sender'ni o'raydi; testda yiqilish yoki osilish rejimini yoqish mumkin. */
public class ControllableSender implements OutboxSender {

    public enum Mode { PASS, FAIL, HANG, THROW, BLOCK, POISON }

    private final OutboxSender delegate;
    private final AtomicReference<Mode> mode = new AtomicReference<>(Mode.PASS);
    private final java.util.concurrent.atomic.AtomicInteger failures = new java.util.concurrent.atomic.AtomicInteger();

    public ControllableSender(OutboxSender delegate) {
        this.delegate = delegate;
    }

    public void mode(Mode m) {
        mode.set(m);
        failures.set(0);
    }

    /** Oxirgi mode() dan beri FAIL/HANG/THROW bilan qaytarilgan yuborishlar. */
    public int failuresSeen() {
        return failures.get();
    }

    @Override
    public CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers) {
        Mode current = mode.get();
        if (current != Mode.PASS && current != Mode.POISON) {
            failures.incrementAndGet();
        }
        return switch (current) {
            case PASS -> delegate.send(topic, key, payload, headers);
            case FAIL -> CompletableFuture.failedFuture(new IllegalStateException("broker down"));
            case HANG -> new CompletableFuture<>();
            case THROW -> throw new IllegalStateException("unexpected");
            case BLOCK -> blockThenThrow();
            // Faqat "poison" so'zi bor payload'ni Kafka doimiy rad etadi (1 MB dan katta kabi).
            case POISON -> new String(payload, java.nio.charset.StandardCharsets.UTF_8).contains("poison")
                    ? CompletableFuture.failedFuture(new org.apache.kafka.common.errors.RecordTooLargeException("too big"))
                    : delegate.send(topic, key, payload, headers);
        };
    }

    /** KafkaProducer.send() metadata/bufer kutib max.block.ms davomida bloklanib, keyin yiqilgandek. */
    private static CompletableFuture<?> blockThenThrow() {
        try {
            Thread.sleep(2_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        throw new IllegalStateException("max.block.ms exceeded");
    }
}
