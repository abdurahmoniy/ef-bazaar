package uz.efbazaar.outbox.it;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.internal.OutboxRepository;
import uz.efbazaar.outbox.internal.OutboxRow;
import uz.efbazaar.outbox.internal.SnapshotMark;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class OutboxRepositoryIT extends AbstractOutboxIT {

    @Autowired OutboxRepository repo;
    @Autowired TransactionTemplate tx;

    private long insert(String topic) {
        return repo.insert(topic, "k", "{}".getBytes(StandardCharsets.UTF_8), "[]");
    }

    @Test
    void claimsPendingInIdOrderAndSkipsPublished() {
        long a = insert("t1");
        long b = insert("t2");
        repo.markPublished(List.of(a));

        List<OutboxRow> rows = tx.execute(s -> repo.claimEvents(10));

        assertThat(rows).extracting(OutboxRow::id).containsExactly(b);
        assertThat(rows.get(0).topic()).isEqualTo("t2");
        assertThat(rows.get(0).key()).isEqualTo("k");
    }

    @Test
    void twoConcurrentClaimersNeverGetTheSameRow() throws Exception {
        for (int i = 0; i < 6; i++) insert("t");
        CountDownLatch firstHolds = new CountDownLatch(1);
        CountDownLatch secondDone = new CountDownLatch(1);

        CompletableFuture<List<OutboxRow>> first = CompletableFuture.supplyAsync(() ->
                tx.execute(s -> {
                    List<OutboxRow> rows = repo.claimEvents(3);
                    firstHolds.countDown();
                    await(secondDone);
                    return rows;
                }));
        firstHolds.await(10, TimeUnit.SECONDS);
        List<OutboxRow> second = tx.execute(s -> repo.claimEvents(10));
        secondDone.countDown();

        assertThat(first.get(10, TimeUnit.SECONDS)).extracting(OutboxRow::id)
                .doesNotContainAnyElementsOf(second.stream().map(OutboxRow::id).toList());
        assertThat(first.get().size() + second.size()).isEqualTo(6);
    }

    @Test
    void markFailedIncrementsAttemptsAndKeepsRowPending() {
        long id = insert("t");
        repo.markFailed(id, "boom");
        repo.markFailed(id, "boom again");

        assertThat(jdbc.queryForObject("SELECT attempts FROM outbox_events WHERE id = ?", Integer.class, id)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT last_error FROM outbox_events WHERE id = ?", String.class, id)).isEqualTo("boom again");
        assertThat(repo.pendingCount()).isEqualTo(1);
    }

    @Test
    void oldestPendingAgeIsZeroWhenEmptyAndGrowsWithOldRows() {
        assertThat(repo.oldestPendingAgeSeconds()).isZero();
        long id = insert("t");
        jdbc.update("UPDATE outbox_events SET created_at = now() - interval '10 minutes' WHERE id = ?", id);
        assertThat(repo.oldestPendingAgeSeconds()).isGreaterThanOrEqualTo(600);
    }

    @Test
    void deletesOnlyPublishedRowsOlderThanCutoff() {
        long oldPublished = insert("t");
        long oldPending = insert("t");
        repo.markPublished(List.of(oldPublished));
        jdbc.update("UPDATE outbox_events SET published_at = now() - interval '8 days', created_at = now() - interval '8 days' WHERE id = ?", oldPublished);

        int deleted = repo.deletePublishedBefore(Instant.now().minusSeconds(7 * 24 * 3600));

        assertThat(deleted).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT id FROM outbox_events", Long.class)).containsExactly(oldPending);
    }

    @Test
    void markCoalescesAndDeleteSkipsNewerMark() {
        repo.mark("listing", "L1");
        repo.mark("listing", "L1");
        SnapshotMark seen = repo.pendingSnapshots(10).get(0);

        repo.mark("listing", "L1");      // relay ko'rgandan keyin yangi o'zgarish
        repo.deleteSnapshot(seen);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isEqualTo(1);
    }

    @Test
    void snapshotVersionsAreMonotonic() {
        long v1 = repo.nextSnapshotVersion();
        long v2 = repo.nextSnapshotVersion();
        assertThat(v2).isGreaterThan(v1);
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
