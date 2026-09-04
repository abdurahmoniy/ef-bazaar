package uz.efbazaar.marketplace.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;
import uz.efbazaar.marketplace.partner.PartnerDtos.ChannelVerifiedRequest;
import uz.efbazaar.marketplace.partner.PartnerDtos.UpdatePartnerSettingsRequest;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerApplicationRepository;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Hamkorlik arizalari.
 *
 * <p>Oqim: ariza → kanalni bot tekshiradi → to'lov → admin tasdig'i.
 * Har qadam orasida kutish bor va kutish qayerda turgani alohida holat
 * bilan belgilanadi — foydalanuvchi botni qo'shmadimi, to'lamadimi, yoki
 * admin ko'rmadimi, uchtasi butunlay boshqa muammo.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerService {

    private static final List<Status> OPEN =
            List.of(Status.AWAITING_CHANNEL, Status.AWAITING_PAYMENT, Status.AWAITING_REVIEW);
    private static final List<Status> CHANNEL_TAKEN =
            List.of(Status.AWAITING_PAYMENT, Status.AWAITING_REVIEW, Status.APPROVED);

    /**
     * Bekor qilish mumkin bo'lgan holatlar — ochiq ariza va faol hamkorlik.
     *
     * <p>REJECTED va CANCELLED yo'q: ular allaqachon yakunlangan va ularni
     * yana bekor qilish hech narsani o'zgartirmaydi.
     */
    private static final List<Status> CANCELLABLE =
            List.of(Status.AWAITING_CHANNEL, Status.AWAITING_PAYMENT,
                    Status.AWAITING_REVIEW, Status.APPROVED);

    private final PartnerSettingsRepository settingsRepository;
    private final PartnerApplicationRepository applications;
    private final AuthSummaryClient users;
    private final PartnerEventPublisher events;
    private final PartnerFeeClient fees;
    private final uz.efbazaar.marketplace.partner.ads.PartnerChannelService partnerChannels;
    private final uz.efbazaar.marketplace.referral.ReferralService referrals;
    private final uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository channels;
    private final uz.efbazaar.marketplace.partner.ads.PartnerPayoutPolicy payoutPolicy;

    // ----- sozlamalar -----

    @Transactional(readOnly = true)
    public PartnerSettings settings() {
        return settingsRepository.findById(PartnerSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException(
                        "partner_settings qatori yo'q — V39 migratsiyasi ishlamagan"));
    }

    @Transactional
    public PartnerSettings updateSettings(UpdatePartnerSettingsRequest request, UUID adminId) {
        PartnerSettings s = settings();
        s.setMinSubscribers(request.minSubscribers());
        s.setPriceSom(request.priceSom());
        s.setDefaultPayoutMode(request.defaultPayoutMode());
        s.setDefaultTradePercentBp(request.defaultTradePercentBp());
        s.setDefaultFixedMonthlySom(request.defaultFixedMonthlySom());
        s.setUpdatedAt(Instant.now());
        s.setUpdatedBy(adminId);

        // Referal mukofoti hamkorlarga xos emas — u har bir
        // foydalanuvchi uchun. Shu ekrandan ham tahrirlanadi, lekin
        // QIYMAT BITTA: referral_settings jadvalidagi o'sha qator.
        // Ikkinchi nusxa bo'lsa, ikki ekran vaqt o'tib bir-biriga zid
        // raqam ko'rsatardi.
        referrals.updateSettings(request.referralRewardSom(), adminId);

        log.info("Partner settings updated by admin={} minSubscribers={} price={} mode={} bp={}",
                adminId, request.minSubscribers(), request.priceSom(),
                request.defaultPayoutMode(), request.defaultTradePercentBp());
        return s;
    }

    /**
     * Sozlamalar javobi — referal mukofoti bilan birga.
     *
     * <p>Mukofot boshqa jadvalda va boshqa bo'limdan ham tahrirlanadi;
     * bu yerda faqat O'QILADI va bitta manbadan keladi.
     */
    @Transactional(readOnly = true)
    public uz.efbazaar.marketplace.partner.PartnerDtos.PartnerSettingsResponse settingsResponse() {
        return uz.efbazaar.marketplace.partner.PartnerDtos.PartnerSettingsResponse.from(
                settings(), referrals.settings().getRewardSom());
    }

    /** Bitta kanalga alohida shart. null maydon — globalga ergashish. */
    @Transactional
    public PartnerChannel updateChannelPayout(UUID channelId,
                                              uz.efbazaar.marketplace.partner.PartnerDtos.UpdateChannelPayoutRequest request,
                                              UUID adminId) {
        PartnerChannel channel = channels.findById(channelId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Kanal topilmadi"));

        channel.setPayoutMode(request.payoutMode());
        channel.setTradePercentBp(request.tradePercentBp());
        channel.setFixedMonthlySom(request.fixedMonthlySom());
        channels.save(channel);

        log.info("Kanal {} to'lov sharti admin {} tomonidan o'zgartirildi: mode={} bp={} oylik={}",
                channelId, adminId, request.payoutMode(), request.tradePercentBp(),
                request.fixedMonthlySom());
        return channel;
    }

    /** Sozlash tabidagi ro'yxat: kanalning o'z qiymati va amaldagi qiymat. */
    @Transactional(readOnly = true)
    public java.util.List<uz.efbazaar.marketplace.partner.PartnerDtos.ChannelPayoutRow> channelPayouts() {
        return channels.findAll().stream().map(c -> {
            var effective = payoutPolicy.resolve(c);
            return new uz.efbazaar.marketplace.partner.PartnerDtos.ChannelPayoutRow(
                    c.getId(), c.getTitle(), c.getPartnerUserId(), c.isActive(),
                    c.getPayoutMode(), c.getTradePercentBp(), c.getFixedMonthlySom(),
                    effective.mode().name(), effective.tradePercentBp(), effective.fixedMonthlySom(),
                    c.getPostPriceSom());
        }).toList();
    }

    // ----- foydalanuvchi tomoni -----

    @Transactional(readOnly = true)
    public Optional<PartnerApplication> myApplication(UUID userId) {
        return applications.findFirstByUserIdOrderByCreatedAtDesc(userId);
    }

    /**
     * Ariza ochadi. Ochiq ariza bo'lsa o'shani qaytaradi, yangisini
     * yaratmaydi — "Ariza topshirish" tugmasi ikki marta bosilganda ikkita
     * ariza va ikkita invoice paydo bo'lmasligi kerak.
     */
    @Transactional
    public PartnerApplication apply(UUID userId) {
        return applications.findFirstByUserIdAndStatusInOrderByCreatedAtDesc(userId, OPEN)
                .orElseGet(() -> {
                    PartnerApplication a = new PartnerApplication();
                    a.setUserId(userId);
                    a.setStatus(Status.AWAITING_CHANNEL);
                    PartnerApplication saved = applications.save(a);
                    log.info("Partner application {} opened by user={}", saved.getId(), userId);
                    return saved;
                });
    }

    // ----- bot tomoni -----

    /**
     * Bot kanalga admin qilib qo'shilganda chaqiriladi.
     *
     * <p>Tekshiruv NATIJASI qanday bo'lishidan qat'i nazar arizaga yoziladi:
     * o'tmagan sabab ham saqlanadi, chunki foydalanuvchi nimani tuzatish
     * kerakligini bilishi kerak. Jimgina rad etish uni "bot ishlamayapti"
     * degan xulosaga olib kelardi.
     */
    @Transactional
    public void onChannelVerified(ChannelVerifiedRequest request) {
        Optional<UUID> userId = users.resolveByTelegramId(request.addedByTelegramId())
                .map(AuthSummaryClient.UserSummary::id);
        if (userId.isEmpty()) {
            log.info("Kanal {} qo'shildi, lekin telegramId={} platformada topilmadi",
                    request.channelId(), request.addedByTelegramId());
            return;
        }

        Optional<PartnerApplication> found = applications
                .findFirstByUserIdAndStatusInOrderByCreatedAtDesc(userId.get(),
                        List.of(Status.AWAITING_CHANNEL, Status.AWAITING_PAYMENT));
        if (found.isEmpty()) {
            log.info("Kanal {} qo'shildi, lekin user={} da ochiq ariza yo'q",
                    request.channelId(), userId.get());
            return;
        }

        PartnerApplication application = found.get();
        application.setChannelId(request.channelId());
        application.setChannelTitle(request.channelTitle());
        application.setChannelUsername(request.channelUsername());
        application.setSubscriberCount(request.subscriberCount());
        application.setChannelPhotoFileId(request.channelPhotoFileId());

        String problem = validateChannel(request);
        if (problem != null) {
            application.setStatus(Status.AWAITING_CHANNEL);
            application.setVerifiedAt(null);
            application.setVerificationError(problem);
            log.info("Ariza {} kanal tekshiruvidan o'tmadi: {}", application.getId(), problem);
            return;
        }

        application.setStatus(Status.AWAITING_PAYMENT);
        application.setVerifiedAt(Instant.now());
        application.setVerificationError(null);
        log.info("Ariza {} kanal tekshiruvidan o'tdi: channel={} subscribers={}",
                application.getId(), request.channelId(), request.subscriberCount());
    }

    /**
     * @return xato matni, yoki null — kanal shartlarga javob beradi
     */
    private String validateChannel(ChannelVerifiedRequest request) {
        if (!request.addedByIsOwner()) {
            return "Botni kanalga kanal EGASI qo'shishi kerak. Siz administrator bo'lsangiz ham "
                    + "yetarli emas — hamkorlik kanal egasiga beriladi.";
        }
        Optional<PartnerApplication> taken =
                applications.findFirstByChannelIdAndStatusIn(request.channelId(), CHANNEL_TAKEN);
        if (taken.isPresent()) {
            return "Bu kanal bo'yicha ariza allaqachon mavjud.";
        }
        int required = settings().getMinSubscribers();
        if (request.subscriberCount() < required) {
            return "Kanalda kamida " + required + " obunachi bo'lishi kerak. Hozir: "
                    + request.subscriberCount() + ".";
        }
        return null;
    }

    // ----- to'lov -----

    /**
     * Foydalanuvchi "To'lash" bosdi.
     *
     * <p>Pul hamyondan yechiladi. Yetmasa payment-service'ning xabari
     * o'zgartirilmasdan qaytadi — unda yetishmayotgan summa bor va
     * frontend shundan hamyonni to'ldirish havolasini yasaydi.
     *
     * <p>To'lov O'TGANIDAN KEYIN holat o'zgaradi. Teskarisi bo'lganda
     * yechish yiqilsa ariza to'langan bo'lib qolardi.
     */
    @Transactional
    public PartnerApplication pay(UUID userId) {
        PartnerApplication application = applications
                .findFirstByUserIdAndStatusInOrderByCreatedAtDesc(userId, List.of(Status.AWAITING_PAYMENT))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "To'lovga tayyor ariza yo'q. Avval kanalni tekshiruvdan o'tkazing."));

        fees.charge(application.getId(), userId, settings().getPriceSom());

        application.setPaidAt(Instant.now());
        application.setStatus(Status.AWAITING_REVIEW);
        log.info("Ariza {} to'landi (hamyondan), admin ko'rigiga o'tdi", application.getId());

        events.applicationAwaitingReview(application);
        return application;
    }


    /**
     * To'lov tasdiqlandi — ariza admin ko'rigiga o'tadi.
     *
     * <p>Idempotent: takroriy hodisa holatni orqaga surmaydi. To'lov
     * hodisalari qayta yetkazilishi mumkin va tasdiqlangan arizani
     * ko'rikka qaytarish adminni ikki marta ishlatardi.
     */
    @Transactional
    public void markPaid(UUID applicationId, UUID invoiceId) {
        PartnerApplication application = applications.findById(applicationId).orElse(null);
        if (application == null) {
            log.warn("To'lov keldi, lekin ariza {} topilmadi", applicationId);
            return;
        }
        if (application.getStatus() != Status.AWAITING_PAYMENT) {
            log.info("Ariza {} to'lov hodisasini e'tiborsiz qoldirdi (holat={})",
                    applicationId, application.getStatus());
            return;
        }
        application.setInvoiceId(invoiceId);
        application.setPaidAt(Instant.now());
        application.setStatus(Status.AWAITING_REVIEW);
        log.info("Ariza {} to'landi, admin ko'rigiga o'tdi", applicationId);

        events.applicationAwaitingReview(application);
    }

    // ----- bekor qilish -----

    /**
     * Foydalanuvchi o'zi voz kechdi.
     *
     * <p>Ochiq ariza ham, faol hamkorlik ham bekor qilinadi — ikkalasi bir
     * xil tugma ostida turadi va farqi faqat qaysi holatdan chiqishida.
     *
     * <p>To'lov QAYTARILMAYDI: pul allaqachon platformaga o'tgan va uni
     * avtomatik qaytarish ledger'da teskari yozuv talab qiladi. Buni admin
     * qo'lda hal qiladi — ekranda shu ochiq aytiladi.
     */
    @Transactional
    public PartnerApplication cancelByUser(UUID userId) {
        PartnerApplication application = applications
                .findFirstByUserIdAndStatusInOrderByCreatedAtDesc(userId, CANCELLABLE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Bekor qilinadigan ariza yoki hamkorlik topilmadi"));
        return cancel(application, "Foydalanuvchi bekor qildi", userId);
    }

    @Transactional
    public PartnerApplication cancelByAdmin(UUID id, UUID adminId, String reason) {
        PartnerApplication application = applications.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ariza topilmadi"));
        if (!CANCELLABLE.contains(application.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu holatdagi arizani bekor qilib bo'lmaydi: " + application.getStatus());
        }
        return cancel(application,
                reason == null || reason.isBlank() ? "Admin to'xtatdi" : reason, adminId);
    }

    /**
     * Bot kanaldan chiqarib tashlandi.
     *
     * <p>Hamkorlik kanalga bog'langan: bot u yerdan ketgach obunachi sonini
     * ham, egalikni ham tekshirib bo'lmaydi. Maqomni saqlab qolish "hamkor,
     * lekin tekshirib bo'lmaydi" degan holatni yaratardi va u ko'rinmas
     * bo'lardi — hech kim bu haqda xabar bermaydi.
     *
     * <p>Idempotent: Telegram bu hodisani takroran yuborishi mumkin.
     */
    @Transactional
    public void onChannelRemoved(Long channelId) {
        if (channelId == null) return;
        applications.findFirstByChannelIdAndStatusInOrderByCreatedAtDesc(channelId, CANCELLABLE)
                .ifPresentOrElse(
                        application -> {
                            cancel(application, "Bot kanaldan chiqarib tashlandi", null);
                            log.info("Ariza {} avtomatik bekor qilindi: kanal {} dan bot chiqarildi",
                                    application.getId(), channelId);
                        },
                        () -> log.debug("Kanal {} dan bot chiqarildi, tegishli ariza yo'q", channelId));
    }

    private PartnerApplication cancel(PartnerApplication application, String reason, UUID by) {
        boolean wasPartner = application.getStatus() == Status.APPROVED;

        application.setStatus(Status.CANCELLED);
        application.setCancelReason(reason);
        application.setCancelledBy(by);
        application.setCancelledAt(Instant.now());
        log.info("Ariza {} bekor qilindi ({}), by={}", application.getId(), reason, by);

        // Hodisa FAQAT tasdiqlangan hamkorlik uchun: auth roldan tushiradi.
        // Tasdiqlanmagan arizada berilgan rol yo'q va hodisa auth'ni
        // keraksiz ishlatardi.
        if (wasPartner) {
            // Kanal qidiruvdan chiqadi: hamkorlikdan chiqqan odamning
            // kanali sotuvchilarga taklif qilinaverishi mumkin emas.
            partnerChannels.deactivate(application.getUserId());
            events.applicationCancelled(application);
        }
        return application;
    }

    // ----- admin tomoni -----

    @Transactional(readOnly = true)
    public Page<PartnerApplication> list(Status status, Pageable pageable) {
        return status == null
                ? applications.findAllByOrderByCreatedAtDesc(pageable)
                : applications.findByStatusOrderByCreatedAtDesc(status, pageable);
    }

    @Transactional
    public PartnerApplication approve(UUID id, UUID adminId, String note) {
        PartnerApplication application = review(id, adminId, note, Status.APPROVED);
        // Reklama kanali shu yerda tug'iladi: bozorda ko'rinish uchun
        // kerak bo'lgan hamma narsa aynan hozir ma'lum.
        partnerChannels.onApproved(application);
        events.applicationApproved(application);
        return application;
    }

    @Transactional
    public PartnerApplication reject(UUID id, UUID adminId, String note) {
        PartnerApplication application = review(id, adminId, note, Status.REJECTED);
        events.applicationRejected(application);
        return application;
    }

    private PartnerApplication review(UUID id, UUID adminId, String note, Status outcome) {
        PartnerApplication application = applications.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ariza topilmadi"));
        if (application.getStatus() != Status.AWAITING_REVIEW) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu ariza ko'rib chiqishga tayyor emas (holat: " + application.getStatus() + ")");
        }
        application.setStatus(outcome);
        application.setReviewedBy(adminId);
        application.setReviewedAt(Instant.now());
        application.setReviewNote(note);
        log.info("Ariza {} {} by admin={}", id, outcome, adminId);
        return application;
    }
}
