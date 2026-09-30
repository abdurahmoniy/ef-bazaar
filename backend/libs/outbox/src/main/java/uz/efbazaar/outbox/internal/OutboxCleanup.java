package uz.efbazaar.outbox.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import uz.efbazaar.outbox.OutboxProperties;

import java.time.Instant;

/** Faqat YUBORILGAN yozuvlarni o'chiradi — yuborilmagani qancha eski bo'lsa ham qoladi. */
public class OutboxCleanup {

    private static final Logger log = LoggerFactory.getLogger(OutboxCleanup.class);

    private final OutboxRepository repo;
    private final OutboxProperties props;

    public OutboxCleanup(OutboxRepository repo, OutboxProperties props) {
        this.repo = repo;
        this.props = props;
    }

    @Scheduled(cron = "${outbox.cleanup.cron:0 15 3 * * *}")
    public void run() {
        int deleted = repo.deletePublishedBefore(Instant.now().minus(props.getCleanup().getRetention()));
        if (deleted > 0) {
            log.info("outbox: {} ta eski yuborilgan yozuv o'chirildi", deleted);
        }
    }
}
