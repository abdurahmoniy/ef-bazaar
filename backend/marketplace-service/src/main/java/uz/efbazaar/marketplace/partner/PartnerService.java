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

    private final PartnerSettingsRepository settingsRepository;
    private final PartnerApplicationRepository applications;
    private final AuthSummaryClient users;
    private final PartnerEventPublisher events;

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
        s.setUpdatedAt(Instant.now());
        s.setUpdatedBy(adminId);
        log.info("Partner settings updated by admin={} minSubscribers={} price={}",
                adminId, request.minSubscribers(), request.priceSom());
        return s;
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
