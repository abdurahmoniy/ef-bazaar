package uz.efbazaar.marketplace.recommendation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** V72 dan keyingi birinchi start'da (va xavfsiz qayta) — value_score IS NULL qatorlarni to'ldiradi. */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "app.recommendation.value-score", name = "backfill-enabled",
        havingValue = "true", matchIfMissing = true)
public class ValueScoreBackfill implements ApplicationRunner {

    private static final int BATCH = 500;
    private final ListingValueScorer scorer;

    @Override
    public void run(ApplicationArguments args) {
        int total = 0;
        try {
            int batch;
            do {
                batch = scorer.backfillBatch(BATCH);
                total += batch;
            } while (batch == BATCH);
        } catch (RuntimeException e) {
            // Start-up yiqilmasin: keyingi boot qayta urinadi.
            log.warn("value_score backfill to'xtadi ({} e'lon hisoblandi): {}", total, e.getMessage());
        }
        if (total > 0) {
            log.info("value_score backfill: {} e'lon hisoblandi", total);
        }
    }
}
