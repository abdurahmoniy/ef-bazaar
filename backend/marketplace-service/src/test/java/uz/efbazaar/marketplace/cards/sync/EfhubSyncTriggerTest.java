package uz.efbazaar.marketplace.cards.sync;

import org.junit.jupiter.api.Test;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EfhubSyncTriggerTest {

    /** Runs the submitted task inline, so the test sees the outcome without waiting. */
    private static final Executor DIRECT = Runnable::run;

    @Test
    void dispatchesTheSyncAndReportsItStarted() {
        EfhubSyncService service = mock(EfhubSyncService.class);
        when(service.isRunning()).thenReturn(false);
        when(service.sync()).thenReturn(new EfhubSyncService.SyncResult(3, 0, 3, false));

        EfhubSyncTrigger.Status status = new EfhubSyncTrigger(service, DIRECT).trigger();

        assertEquals(EfhubSyncTrigger.Status.STARTED, status);
        verify(service).sync();
    }

    @Test
    void refusesToDispatchWhileASyncIsRunning() {
        EfhubSyncService service = mock(EfhubSyncService.class);
        when(service.isRunning()).thenReturn(true);

        EfhubSyncTrigger.Status status = new EfhubSyncTrigger(service, DIRECT).trigger();

        assertEquals(EfhubSyncTrigger.Status.ALREADY_RUNNING, status);
        verify(service, never()).sync();
    }

    /**
     * The caller has already been handed its 202 by the time the sync runs, so a
     * failure must not escape onto the executor thread.
     */
    @Test
    void swallowsAFailingSyncSoTheExecutorThreadSurvives() {
        EfhubSyncService service = mock(EfhubSyncService.class);
        when(service.isRunning()).thenReturn(false);
        when(service.sync()).thenThrow(new IllegalStateException("efhub down"));

        AtomicInteger ran = new AtomicInteger();
        Executor counting = task -> {
            task.run();
            ran.incrementAndGet();
        };

        EfhubSyncTrigger.Status status = new EfhubSyncTrigger(service, counting).trigger();

        assertEquals(EfhubSyncTrigger.Status.STARTED, status);
        assertEquals(1, ran.get(), "executor task must complete normally");
    }
}
