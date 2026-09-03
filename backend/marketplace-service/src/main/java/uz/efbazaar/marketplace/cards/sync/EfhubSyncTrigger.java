package uz.efbazaar.marketplace.cards.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/**
 * Runs the daily sync on demand, off the request thread.
 *
 * <p>A full run scrapes up to {@code batch-limit} player pages with a 5s
 * courtesy delay between them, so it outlives any sensible HTTP timeout — the
 * caller gets an immediate acknowledgement and reads the outcome from the
 * "Card sync bajarildi" summary {@link EfhubSyncService} posts to the Telegram
 * log channel when it finishes.
 *
 * <p>Unlike {@link EfhubSyncJob} this ignores {@code app.cards.sync.enabled}:
 * that flag governs the schedule, and an admin asking for a run has asked for
 * one.
 */
@Component
public class EfhubSyncTrigger {

    private static final Logger log = LoggerFactory.getLogger(EfhubSyncTrigger.class);

    private final EfhubSyncService service;
    private final Executor executor;

    public EfhubSyncTrigger(EfhubSyncService service,
                            @Qualifier("efhubSyncExecutor") Executor efhubSyncExecutor) {
        this.service = service;
        this.executor = efhubSyncExecutor;
    }

    public Status trigger() {
        if (service.isRunning()) {
            log.info("efhub sync trigger ignored: a run is already in progress");
            return Status.ALREADY_RUNNING;
        }
        try {
            executor.execute(this::runQuietly);
        } catch (RejectedExecutionException e) {
            // The single worker is busy and its queue is full — same answer as
            // the isRunning() check above, just lost a race to get here.
            log.info("efhub sync trigger rejected: worker busy");
            return Status.ALREADY_RUNNING;
        }
        return Status.STARTED;
    }

    /**
     * Nobody is left to catch this — the caller was answered before the run
     * started — so a failure is logged here rather than killing the worker.
     */
    private void runQuietly() {
        long start = System.currentTimeMillis();
        try {
            EfhubSyncService.SyncResult result = service.sync();
            log.info("efhub manual sync done: added={} failed={} new_total={} skipped={} took_ms={}",
                    result.added(), result.failed(), result.totalNew(), result.skipped(),
                    System.currentTimeMillis() - start);
        } catch (RuntimeException e) {
            log.warn("efhub manual sync failed after {}ms: {}",
                    System.currentTimeMillis() - start, EfhubClient.describeChain(e));
        }
    }

    public enum Status {
        /** Dispatched; the summary lands in the log channel when it finishes. */
        STARTED,
        /** The scheduled job, or an earlier trigger, still holds the run. */
        ALREADY_RUNNING
    }
}
