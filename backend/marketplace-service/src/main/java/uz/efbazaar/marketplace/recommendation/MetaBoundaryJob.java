package uz.efbazaar.marketplace.recommendation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * META oynasi o'z-o'zidan ochiladi/yopiladi (admin hech narsa bosmaydi) — value_score va karta
 * snapshot'i shunda ham yangilanishi kerak. Oxirgi 25 soat: kunlik job bir marta o'tkazib
 * yuborilsa ham chegara yo'qolmaydi; takror zararsiz.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MetaBoundaryJob {

    private static final Duration WINDOW = Duration.ofHours(25);
    private final CardCatalogReader catalog;
    private final CardChangeHandler handler;

    @Scheduled(cron = "${app.recommendation.meta-boundary-cron:0 5 0 * * *}", zone = "UTC")
    public void run() {
        Instant now = Instant.now();
        List<Long> crossed = catalog.metaBoundariesBetween(now.minus(WINDOW), now);
        if (!crossed.isEmpty()) {
            handler.cardsChanged(crossed);
            log.info("META chegarasi: {} karta yangilandi", crossed.size());
        }
    }
}
