package uz.efbazaar.marketplace.cards.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class EfhubSyncJob {

    private static final Logger log = LoggerFactory.getLogger(EfhubSyncJob.class);

    private final EfhubSyncService service;
    private final EfhubSyncProperties props;

    public EfhubSyncJob(EfhubSyncService service, EfhubSyncProperties props) {
        this.service = service;
        this.props = props;
    }

    @Scheduled(cron = "${app.cards.sync.cron:0 0 9 * * *}", zone = "UTC")
    public void run() {
        if (!props.enabled()) {
            log.debug("efhub sync disabled (app.cards.sync.enabled=false)");
            return;
        }
        log.info("efhub sync starting");
        long start = System.currentTimeMillis();
        EfhubSyncService.SyncResult result = service.sync();
        long took = System.currentTimeMillis() - start;
        log.info("efhub sync done: added={} failed={} new_total={} skipped={} took_ms={}",
                result.added(), result.failed(), result.totalNew(), result.skipped(), took);
    }
}
