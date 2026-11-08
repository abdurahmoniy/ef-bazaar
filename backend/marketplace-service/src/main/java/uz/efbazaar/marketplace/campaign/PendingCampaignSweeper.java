package uz.efbazaar.marketplace.campaign;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.PendingCampaignAttributionRepository;

import java.time.Duration;
import java.time.Instant;

/**
 * Ro'yxatdan o'tishga aylanmagan bot kodlarini tozalaydi. Guruhdagi ommaviy
 * havolani bosganlarning ko'pchiligi akkount ochmaydi va ularning qatorlarini
 * {@code claimOnRegistration} hech qachon ko'rmaydi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PendingCampaignSweeper {

    private final PendingCampaignAttributionRepository pending;

    @Value("${app.campaigns.pending-ttl-days:30}")
    private int ttlDays;

    @Scheduled(cron = "${app.campaigns.sweep-cron:0 40 3 * * *}", zone = "UTC")
    @Transactional
    public void sweep() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(ttlDays));
        long removed = pending.deleteByCreatedAtBefore(cutoff);
        if (removed > 0) {
            log.info("Eskirgan kampaniya kodlari o'chirildi: {} ta ({} kundan eski)", removed, ttlDays);
        }
    }
}
