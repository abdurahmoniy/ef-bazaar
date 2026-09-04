package uz.efbazaar.marketplace.partner.ads;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerApplication;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.PartnerSettings;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Optional;
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
public class PartnerChannelService {

    /** O'xshash belgilar yo'q: kod og'zaki ham uzatiladi. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;
    private static final int MAX_ATTEMPTS = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PartnerChannelRepository channels;
    private final PartnerSettingsRepository settingsRepository;
    private final ChannelPostService channelPosts;

    /**
     * Necha kun KETMA-KET o'qib bo'lmasa hamkorlik to'xtaydi.
     *
     * <p>Yangilanish kuniga bir marta ishlaydi, ya'ni bu — kun soni.
     */
    private final int refreshFailureLimit;

    public PartnerChannelService(PartnerChannelRepository channels,
                                 PartnerSettingsRepository settingsRepository,
                                 ChannelPostService channelPosts,
                                 @Value("${app.partners.refresh-failure-limit:3}") int refreshFailureLimit) {
        this.channels = channels;
        this.settingsRepository = settingsRepository;
        this.channelPosts = channelPosts;
        this.refreshFailureLimit = refreshFailureLimit;
    }

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

        // Bu kanalda tirik hamkorlik bor bo'lsa — u kimniki?
        Optional<PartnerChannel> live =
                channels.findByTelegramChannelIdAndActiveTrue(application.getChannelId());
        if (live.isPresent() && !live.get().getPartnerUserId().equals(application.getUserId())) {
            // Kanal Telegram'da boshqa odamga o'tgan: ariza berish uchun
            // bot yangi odamni EGA deb tasdiqlagan. Eski hamkorning
            // klik va referal tarixi unga qolishi kerak, shuning uchun
            // qatori olib qo'yilmaydi — yopiladi.
            PartnerChannel previous = live.get();
            previous.setActive(false);
            channels.save(previous);
            channelPosts.refundStranded(previous.getId());
            log.info("Kanal {} egasi almashdi — eski hamkorlik {} yopildi",
                    application.getChannelId(), previous.getId());
        }

        // O'SHA odam qayta qo'shilyaptimi. Yangi qator ochsak, link_code
        // ham yangilanardi — u esa shu kanalga chiqib bo'lgan HAR BIR
        // postda va referrals.partner_channel_id da yozilgan. Eski
        // qatorni qoldirib yangisini ochish voronkani ikkiga bo'lardi
        // va o'tgan savdolar hech qaysi hamkorga tegishli bo'lmay
        // qolardi.
        Optional<PartnerChannel> mine = channels
                .findFirstByTelegramChannelIdAndPartnerUserIdOrderByCreatedAtDesc(
                        application.getChannelId(), application.getUserId());
        if (mine.isPresent()) {
            rejoin(mine.get(), application);
            return;
        }

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
        // NOLDAN boshlanadi. Narx hamkorning o'z ishi va u hali
        // qo'ymagan — "eng kam narx" deb biror qiymat qo'yish uning
        // nomidan qaror qabul qilish bo'lardi.
        channel.setPostPriceSom(BigDecimal.ZERO);
        // To'lov sozlamalari BO'SH: kanal global siyosatga ergashadi.
        // Bugungi qiymatni nusxalab olsak, admin siyosatni
        // o'zgartirganda bu kanal eski shartda qolib ketardi.
        channels.save(channel);

        log.info("Hamkor kanali ochildi: {} ({}), egasi {}",
                channel.getTitle(), channel.getTelegramChannelId(), channel.getPartnerUserId());
    }

    /**
     * Bekor qilgan hamkor qaytib keldi.
     *
     * <p>Eski qator TIRILTIRILADI, yangisi ochilmaydi. {@code link_code}
     * shu kanalga chiqib bo'lgan har bir postda va har bir referal
     * yozuvida turibdi — uni almashtirsak, o'tgan reklamalar hech
     * qaysi hamkorga olib bormay qolardi.
     *
     * <p>Narx va admin qo'ygan shaxsiy shartlar SAQLANADI: ular shu
     * hamkor uchun qo'yilgan va u o'sha odamning o'zi.
     */
    private void rejoin(PartnerChannel channel, PartnerApplication application) {
        channel.setApplicationId(application.getId());
        channel.setTitle(application.getChannelTitle() == null
                ? channel.getTitle() : application.getChannelTitle());
        channel.setUsername(application.getChannelUsername());
        channel.setPhotoFileId(application.getChannelPhotoFileId());
        if (application.getSubscriberCount() != null) {
            channel.setSubscriberCount(application.getSubscriberCount());
        }
        channel.setSubscriberSyncedAt(Instant.now());
        // Ketma-ket xatolar hisoblagichi ham nolga qaytadi: kanal endi
        // qaytadan o'qilib turibdi.
        channel.setRefreshFailures(0);
        channel.setActive(true);
        channels.save(channel);

        log.info("Hamkor kanali qayta ochildi: {} ({}), egasi {}",
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

    /**
     * Kunlik yangilanishning natijasi.
     *
     * <p>Muvaffaqiyat — raqamlar yangilanadi va hisoblagich nolga
     * qaytadi. Xato — hisoblagich o'sadi va chegaraga yetganda
     * hamkorlik to'xtaydi.
     *
     * <p>Nega darhol to'xtatilmaydi: Telegram bir daqiqaga javob
     * bermasligi bo'ladigan ish, va shuning uchun odamning hamkorligi
     * tugab qolishi mumkin emas. Nega umuman to'xtatiladi: botsiz
     * kanal ro'yxatda qolsa, sotuvchi unga pul to'lab e'lon buyurtma
     * qiladi va post hech qachon chiqmaydi.
     */
    @Transactional
    public void onChannelRefreshed(ChannelRefreshedRequest request) {
        channels.findById(request.partnerChannelId()).ifPresent(channel -> {
            // O'chirilgan kanalning yangilanishi kechikib kelishi mumkin —
            // uni tirilitib yubormaymiz.
            if (!channel.isActive()) return;

            if (request.subscriberCount() == null) {
                onRefreshFailed(channel, request.error());
                return;
            }

            channel.setSubscriberCount(request.subscriberCount());
            channel.setSubscriberSyncedAt(Instant.now());
            // Rasm ATAYLAB null bo'lishi ham mumkin: hamkor avatarni
            // olib tashlagan bo'lsa, bizda eskisi qolib ketmasin.
            channel.setPhotoFileId(request.photoFileId());
            if (request.title() != null && !request.title().isBlank()) {
                channel.setTitle(request.title());
            }
            channel.setUsername(request.username());
            channel.setRefreshFailures(0);
            channels.save(channel);
        });
    }

    private void onRefreshFailed(PartnerChannel channel, String error) {
        int failures = channel.getRefreshFailures() + 1;
        channel.setRefreshFailures(failures);
        channels.save(channel);

        if (failures < refreshFailureLimit) {
            log.warn("Kanal {} o'qilmadi ({}/{}): {}",
                    channel.getId(), failures, refreshFailureLimit, error);
            return;
        }
        log.warn("Kanal {} ketma-ket {} marta o'qilmadi — hamkorlik to'xtatiladi",
                channel.getId(), failures);
        deactivate(channel.getPartnerUserId());
    }

    public record ChannelRefreshedRequest(
            @jakarta.validation.constraints.NotNull UUID partnerChannelId,
            String title,
            String username,
            String photoFileId,
            Integer subscriberCount,
            String error) {}

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
