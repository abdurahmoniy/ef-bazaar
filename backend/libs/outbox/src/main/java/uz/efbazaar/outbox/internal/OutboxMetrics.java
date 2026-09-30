package uz.efbazaar.outbox.internal;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;

/** Prometheus: outbox_pending_count, outbox_pending_oldest_seconds (alert > 300). */
public class OutboxMetrics implements MeterBinder {

    private final OutboxRepository repo;

    public OutboxMetrics(OutboxRepository repo) {
        this.repo = repo;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder("outbox.pending.count", repo, r -> r.pendingCount())
                .description("Kafka'ga hali yetkazilmagan outbox yozuvlari")
                .register(registry);
        Gauge.builder("outbox.pending.oldest.seconds", repo, r -> r.oldestPendingAgeSeconds())
                .description("Eng eski yetkazilmagan yozuvning yoshi")
                .register(registry);
    }
}
