package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.util.List;

/**
 * Har kuni faol kanallarni Telegram'dan qayta o'qishga qo'yadi.
 *
 * <p>Obunachi soni, nom va avatar hamkorlik davomida o'zgarib turadi,
 * lekin ular faqat kanal tekshirilgan paytda bir marta olinardi.
 * Reklama bozorida sotuvchi ko'radigan raqam esa aynan shu — eskirgan
 * obunachi soni asosida pul to'lanadi.
 *
 * <p>Bu yerda TELEGRAM'GA MUROJAAT QILINMAYDI: bot tokeni faqat botda.
 * Ish har kanal uchun bitta topshiriq yuboradi, bot o'qiydi va natijani
 * {@code /internal/.../channel-refreshed} orqali qaytaradi.
 *
 * <p>Kanal-kanal qilib yuboriladi, bitta ro'yxat bilan emas: bitta
 * kanalning Telegram xatosi qolganlarini to'sib qo'ymasin.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChannelRefreshJob {

    private final PartnerChannelRepository channels;
    private final PartnerAdEventPublisher events;

    @Scheduled(cron = "${app.partners.refresh-cron:0 30 3 * * *}", zone = "UTC")
    public void run() {
        List<PartnerChannel> active = channels.findByActiveTrueOrderBySubscriberCountDesc();
        if (active.isEmpty()) return;

        for (PartnerChannel channel : active) {
            events.refreshRequested(channel);
        }
        log.info("Kanal yangilanishi so'raldi: {} ta kanal", active.size());
    }
}
