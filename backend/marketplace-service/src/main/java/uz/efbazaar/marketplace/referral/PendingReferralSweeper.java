package uz.efbazaar.marketplace.referral;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.referral.ReferralRepositories.PendingReferralRepository;

import java.time.Duration;
import java.time.Instant;

/**
 * Ro'yxatdan o'tishga aylanmagan taklif kodlarini tozalaydi.
 *
 * <p>Bot havolasini bosgan har bir odam ro'yxatdan o'tmaydi — kanaldagi
 * ommaviy havolada ko'pchiligi shunchaki qarab chiqadi. Ularning
 * qatorlarini {@code claimOnRegistration} hech qachon ko'rmaydi, ya'ni
 * jadval faqat o'sadi.
 *
 * <p>Muddat da'vo oynasidan (bir soat) ancha uzun: odam havolani bosib,
 * o'ylanib, ertasiga qaytishi mumkin. O'ttiz kundan keyin esa kod
 * baribir ishlamaydi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PendingReferralSweeper {

    private final PendingReferralRepository pending;

    @Value("${app.referrals.pending-ttl-days:30}")
    private int ttlDays;

    @Scheduled(cron = "${app.referrals.sweep-cron:0 30 3 * * *}", zone = "UTC")
    @Transactional
    public void sweep() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(ttlDays));
        long removed = pending.deleteByCreatedAtBefore(cutoff);
        if (removed > 0) {
            log.info("Eskirgan taklif kodlari o'chirildi: {} ta ({} kundan eski)", removed, ttlDays);
        }
    }
}
