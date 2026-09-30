package uz.efbazaar.outbox.it;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import uz.efbazaar.outbox.internal.OutboxCleanup;
import uz.efbazaar.outbox.internal.OutboxMetrics;
import uz.efbazaar.outbox.internal.OutboxRepository;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxHousekeepingIT extends AbstractOutboxIT {

    @Autowired OutboxRepository repo;
    @Autowired OutboxCleanup cleanup;
    @Autowired OutboxMetrics metrics;

    @Test
    void cleanupRemovesOnlyOldPublishedRows() {
        long oldDone = repo.insert("t", "k", new byte[]{1}, "[]");
        long freshDone = repo.insert("t", "k", new byte[]{1}, "[]");
        long pending = repo.insert("t", "k", new byte[]{1}, "[]");
        repo.markPublished(List.of(oldDone, freshDone));
        jdbc.update("UPDATE outbox_events SET published_at = now() - interval '8 days' WHERE id = ?", oldDone);

        cleanup.run();

        assertThat(jdbc.queryForList("SELECT id FROM outbox_events ORDER BY id", Long.class))
                .containsExactly(freshDone, pending);
    }

    @Test
    void metricsReportPendingCountAndOldestAge() {
        MeterRegistry registry = new SimpleMeterRegistry();
        metrics.bindTo(registry);
        long id = repo.insert("t", "k", new byte[]{1}, "[]");
        jdbc.update("UPDATE outbox_events SET created_at = now() - interval '6 minutes' WHERE id = ?", id);

        assertThat(registry.get("outbox.pending.count").gauge().value()).isEqualTo(1.0);
        assertThat(registry.get("outbox.pending.oldest.seconds").gauge().value()).isGreaterThanOrEqualTo(360.0);
    }
}
