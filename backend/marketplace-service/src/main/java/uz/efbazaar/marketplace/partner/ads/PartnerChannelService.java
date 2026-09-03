package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerApplication;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.PartnerSettings;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

/**
 * Tasdiqlangan hamkorlikning reklama kanalini ochadi va yopadi.
 *
 * <p>Kanal ariza tasdiqlangan paytda tug'iladi: reklama bozorida
 * ko'rinish uchun kerak bo'lgan hamma narsa — nom, obunachi soni,
 * egasi — aynan o'sha paytda ma'lum bo'ladi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerChannelService {

    /** O'xshash belgilar yo'q: kod og'zaki ham uzatiladi. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;
    private static final int MAX_ATTEMPTS = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PartnerChannelRepository channels;
    private final PartnerSettingsRepository settingsRepository;
    private final ChannelPostService channelPosts;

    @Transactional
    public void onApproved(PartnerApplication application) {
        // Kanalsiz ariza tasdiqlanmasligi kerak, lekin shunday qator
        // bo'lsa telegram_channel_id NOT NULL da yiqilib, butun
        // tasdiqlashni orqaga qaytarardi.
        if (application.getChannelId() == null) {
            log.warn("Ariza {} kanalsiz tasdiqlangan — reklama kanali ochilmadi", application.getId());
            return;
        }
        // Ikki marta tasdiqlash yoki hodisaning qayta yetkazilishi
        // ikkinchi kanal ochmasin.
        if (channels.findByApplicationId(application.getId()).isPresent()) return;

        PartnerSettings settings = settings();

        PartnerChannel channel = new PartnerChannel();
        channel.setId(UUID.randomUUID());
        channel.setPartnerUserId(application.getUserId());
        channel.setApplicationId(application.getId());
        channel.setTelegramChannelId(application.getChannelId());
        channel.setTitle(application.getChannelTitle() == null
                ? "Kanal" : application.getChannelTitle());
        channel.setUsername(application.getChannelUsername());
        channel.setPhotoFileId(application.getChannelPhotoFileId());
        channel.setSubscriberCount(application.getSubscriberCount() == null
                ? 0 : application.getSubscriberCount());
        channel.setSubscriberSyncedAt(Instant.now());
        channel.setLinkCode(freshCode());
        // Eng past ruxsat etilgan narxdan boshlaymiz — hamkor uni o'z
        // panelidan ko'taradi.
        channel.setPostPriceSom(settings.getMinPostPriceSom());
        // To'lov sozlamalari BO'SH: kanal global siyosatga ergashadi.
        // Bugungi qiymatni nusxalab olsak, admin siyosatni
        // o'zgartirganda bu kanal eski shartda qolib ketardi.
        channels.save(channel);

        log.info("Hamkor kanali ochildi: {} ({}), egasi {}",
                channel.getTitle(), channel.getTelegramChannelId(), channel.getPartnerUserId());
    }

    /**
     * Hamkorlik to'xtaganda kanalni qidiruvdan chiqaradi.
     *
     * <p>O'CHIRILMAYDI, faqat {@code active = false}. Chiqib bo'lgan
     * postlar va ular keltirgan savdolar kanalga bog'langan holda
     * qoladi — hisobot ularni yo'qotmasligi kerak.
     */
    @Transactional
    public void deactivate(UUID partnerUserId) {
        channels.findByPartnerUserIdAndActiveTrue(partnerUserId).ifPresent(channel -> {
            channel.setActive(false);
            channels.save(channel);
            // Chiqmagan buyurtmalar hech qachon chiqmaydi — bot endi
            // kanalda administrator emas. Sotuvchining puli ushlangan
            // holda qolib ketmasin.
            channelPosts.refundStranded(channel.getId());
            log.info("Hamkor kanali qidiruvdan chiqarildi: {}", channel.getId());
        });
    }

    PartnerSettings settings() {
        return settingsRepository.findById(PartnerSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("partner_settings qatori yo'q"));
    }

    private String freshCode() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            String candidate = sb.toString();
            if (!channels.existsByLinkCode(candidate)) return candidate;
        }
        // Takroriy kod ikki kanalning attributsiyasini aralashtiradi —
        // jimgina bermaganimiz yaxshi.
        throw new IllegalStateException(
                "Kanal kodi yaratilmadi: " + MAX_ATTEMPTS + " urinish to'qnashdi");
    }
}
