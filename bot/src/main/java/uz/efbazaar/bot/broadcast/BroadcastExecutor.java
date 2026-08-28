package uz.efbazaar.bot.broadcast;

import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.SendOutcome;
import uz.efbazaar.bot.telegram.TelegramApiClient.UrlButton;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Ommaviy xabarni foydalanuvchilarga yuboradi.
 *
 * <p>BITTA OQIM. Ijro navbati bitta ipdan iborat va bu ataylab: Telegram
 * tezlik chegarasi butun bot uchun umumiy, ya'ni parallel jo'natish
 * hech narsani tezlashtirmaydi — faqat 429 ni tezroq keltiradi. Bitta oqim
 * bir vaqtda ikkita jo'natish ketishining ham oldini oladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BroadcastExecutor {

    private final TelegramApiClient telegram;
    private final BroadcastRecipients recipients;
    private final BroadcastProgressReporter reporter;
    private final BroadcastProperties props;

    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "broadcast");
        t.setDaemon(true);
        return t;
    });

    public void submit(BroadcastJob job) {
        worker.submit(() -> {
            try {
                run(job);
            } catch (Exception e) {
                log.error("Broadcast {} yiqildi", job.broadcastId(), e);
                reporter.report(job.broadcastId(), new BroadcastProgress(
                        BroadcastProgress.Status.FAILED, 0, 0, 0, 0, e.getMessage()));
            }
        });
    }

    private void run(BroadcastJob job) {
        List<List<UrlButton>> keyboard = toKeyboard(job.buttons());
        var audience = job.audience() == null ? BroadcastJob.Audience.ALL : job.audience();

        int total = 0, sent = 0, failed = 0, blocked = 0, page = 0;
        long nextSendAt = System.currentTimeMillis();

        log.info("Broadcast {} boshlandi (audience={})", job.broadcastId(), audience);

        while (true) {
            // SELECTED da manzillar allaqachon topshiriqda keladi — adminka
            // ularni qo'lda tanlagan. auth-service'ga borish nafaqat keraksiz,
            // balki noto'g'ri ham bo'lardi: u yerdan boshqa ro'yxat qaytardi.
            var chunk = audience == BroadcastJob.Audience.SELECTED
                    ? selectedChunk(job, page)
                    : recipients.fetch(audience, page);
            if (chunk == null) {
                // Ro'yxatni ololmadik. Yarim yuborilgan holatni MUVAFFAQIYAT
                // deb belgilamaymiz — admin qolganini qo'lda hal qilishi uchun
                // buni bilishi kerak.
                reporter.report(job.broadcastId(), new BroadcastProgress(
                        BroadcastProgress.Status.FAILED, total, sent, failed, blocked,
                        "Manzillar ro'yxatini olib bo'lmadi"));
                return;
            }
            if (page == 0) {
                total = (int) chunk.totalElements();
                reporter.report(job.broadcastId(), new BroadcastProgress(
                        BroadcastProgress.Status.SENDING, total, 0, 0, 0, null));
            }

            for (Long chatId : chunk.content()) {
                if (chatId == null) continue;

                nextSendAt = throttle(nextSendAt);
                SendOutcome outcome = telegram.sendBroadcast(
                        String.valueOf(chatId), job.messageText(), job.bannerFileId(), keyboard);

                if (outcome.result() == SendOutcome.Result.RATE_LIMITED) {
                    // Telegram aytgancha kutamiz va SHU foydalanuvchiga qayta
                    // urinamiz — aks holda chegaraga urilgan har bir odam
                    // xabarni umuman olmasdi.
                    sleep(outcome.retryAfterSeconds() * 1000L);
                    outcome = telegram.sendBroadcast(
                            String.valueOf(chatId), job.messageText(), job.bannerFileId(), keyboard);
                    nextSendAt = System.currentTimeMillis();
                }

                switch (outcome.result()) {
                    case SENT -> sent++;
                    case BLOCKED -> blocked++;
                    default -> {
                        failed++;
                        log.debug("Broadcast {} chatId={} xato: {}",
                                job.broadcastId(), chatId, outcome.error());
                    }
                }

                if ((sent + failed + blocked) % props.progressEvery() == 0) {
                    reporter.report(job.broadcastId(), new BroadcastProgress(
                            BroadcastProgress.Status.SENDING, total, sent, failed, blocked, null));
                }
            }

            if (chunk.last()) break;
            page++;
        }

        log.info("Broadcast {} yakunlandi: sent={} blocked={} failed={} (jami {})",
                job.broadcastId(), sent, blocked, failed, total);
        reporter.report(job.broadcastId(), new BroadcastProgress(
                BroadcastProgress.Status.SENT, total, sent, failed, blocked, null));
    }

    /**
     * Topshiriqdagi tayyor ro'yxatni sahifalash shakliga keltiradi, shunda
     * asosiy sikl ikkala manba uchun bir xil qoladi.
     */
    private BroadcastRecipients.TelegramIdPage selectedChunk(BroadcastJob job, int page) {
        if (page > 0) return null;
        List<Long> ids = job.recipientTelegramIds() == null ? List.of() : job.recipientTelegramIds();
        return new BroadcastRecipients.TelegramIdPage(ids, true, ids.size());
    }

    /**
     * Keyingi yuborishgacha kutadi va undan keyingi vaqtni qaytaradi.
     *
     * <p>Tanaffus yuborishdan OLDIN hisoblanadi, keyin emas: Telegram
     * javobi qancha kechikkanidan qat'i nazar tezlik bir xil qoladi.
     */
    private long throttle(long nextSendAt) {
        long now = System.currentTimeMillis();
        if (now < nextSendAt) sleep(nextSendAt - now);
        return Math.max(now, nextSendAt) + props.intervalMillis();
    }

    private void sleep(long millis) {
        if (millis <= 0) return;
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Jo'natish to'xtatildi", e);
        }
    }

    private List<List<UrlButton>> toKeyboard(List<List<BroadcastJob.Button>> rows) {
        if (rows == null) return List.of();
        return rows.stream()
                .filter(row -> row != null && !row.isEmpty())
                .map(row -> row.stream().map(b -> new UrlButton(b.text(), b.url())).toList())
                .toList();
    }

    @PreDestroy
    void shutdown() {
        worker.shutdownNow();
        awaitQuietly();
    }

    /**
     * Navbatdagi ishni tugatib to'xtaydi. Sinovlar uchun: {@code submit}
     * asinxron, natijani tekshirishdan oldin ijro yakunlanishi kerak.
     */
    void shutdownAndWait() throws InterruptedException {
        worker.shutdown();
        worker.awaitTermination(30, TimeUnit.SECONDS);
    }

    private void awaitQuietly() {
        try {
            worker.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
