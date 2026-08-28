package uz.efbazaar.marketplace.botsettings;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.Audience;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.InlineButton;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.Status;
import uz.efbazaar.marketplace.botsettings.BotBroadcastDtos.BroadcastProgressRequest;
import uz.efbazaar.marketplace.botsettings.BotBroadcastDtos.ButtonDto;
import uz.efbazaar.marketplace.botsettings.BotBroadcastDtos.CreateBroadcastRequest;
import uz.efbazaar.marketplace.service.MediaService;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Ommaviy xabarni yaratadi va botga topshiradi.
 *
 * <p>YUBORILGAN XABARNI QAYTARIB BO'LMAYDI. Butun sinf shu haqiqat atrofida
 * qurilgan: tekshiruvlar jo'natish boshlanishidan OLDIN bajariladi, bir
 * vaqtda ikkita jo'natishga yo'l qo'yilmaydi, va hech bir qator o'chirilmaydi
 * yoki tahrirlanmaydi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BotBroadcastService {

    private final BotBroadcastRepository repository;
    private final BotSettingsService settings;
    private final MediaService mediaService;
    private final BotBroadcastDispatcher dispatcher;

    @Transactional(readOnly = true)
    public Page<BotBroadcast> history(Pageable pageable) {
        return repository.findAllByOrderByCreatedAtDesc(pageable);
    }

    @Transactional(readOnly = true)
    public BotBroadcast get(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Jo'natma topilmadi"));
    }

    /** Ketayotgan jo'natma bo'lsa qaytaradi — adminka progressni shundan oladi. */
    @Transactional(readOnly = true)
    public BotBroadcast activeOrNull() {
        return repository
                .findFirstByStatusInOrderByCreatedAtDesc(List.of(Status.QUEUED, Status.SENDING))
                .orElse(null);
    }

    @Transactional
    public BotBroadcast create(CreateBroadcastRequest request, MultipartFile banner, UUID adminId) {
        // Ketayotgan jo'natma borligini oldindan tekshiramiz, chunki DB
        // indeksidan kelgan xato foydalanuvchiga tushunarsiz bo'ladi.
        // Indeksning o'zi ham qoladi: ikki admin ayni paytda bosganda
        // faqat u to'xtata oladi.
        if (activeOrNull() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bitta jo'natma allaqachon ketayapti. U tugashini kuting.");
        }

        String text = request.messageText().strip();
        settings.validateHtml(text);
        boolean withBanner = banner != null && !banner.isEmpty();
        settings.validateLength(text, withBanner);

        List<List<InlineButton>> buttons = validateButtons(request.buttons());

        Audience audience = request.audience() == null ? Audience.ALL : request.audience();
        List<Long> recipients = resolveRecipients(audience, request.recipientTelegramIds());

        BotBroadcast broadcast = new BotBroadcast();
        broadcast.setMessageText(text);
        broadcast.setButtons(buttons);
        broadcast.setAudience(audience);
        broadcast.setRecipientTelegramIds(recipients);
        broadcast.setCreatedBy(adminId);
        broadcast.setStatus(Status.QUEUED);

        if (withBanner) {
            // Rasm Telegram media topikiga yuboriladi va bizda faqat file_id
            // qoladi — e'lon rasmlari bilan bir xil yo'l.
            broadcast.setBannerFileId(
                    mediaService.uploadToBot(List.of(banner), "Ommaviy xabar banneri", null).get(0));
        }

        BotBroadcast saved = repository.save(broadcast);

        // Botga topshirish COMMIT'dan keyin. Aks holda bot qatorni o'qishga
        // urinib topa olmasdi — tranzaksiya hali yopilmagan bo'lardi.
        UUID id = saved.getId();
        afterCommit(() -> dispatcher.dispatch(
                id, text, saved.getBannerFileId(), buttons, audience, recipients));

        log.info("Broadcast {} created by admin={} audience={} buttons={} banner={}",
                id, adminId, audience, buttons.size(), withBanner);
        return saved;
    }

    /**
     * Botdan kelgan progress.
     *
     * <p>Sonlar ALMASHTIRILADI, qo'shilmaydi: bot har safar o'zining joriy
     * jamisini yuboradi. Qo'shish bo'lganda takroriy yoki tartibsiz kelgan
     * xabar hisobni jimgina shishirib yuborardi.
     */
    @Transactional
    public BotBroadcast applyProgress(UUID id, BroadcastProgressRequest progress) {
        BotBroadcast broadcast = get(id);

        if (broadcast.getStatus() == Status.SENDING && progress.status() == Status.SENDING
                && broadcast.getStartedAt() == null) {
            broadcast.setStartedAt(Instant.now());
        }
        if (broadcast.getStatus() == Status.QUEUED && progress.status().isActive()) {
            broadcast.setStartedAt(Instant.now());
        }

        broadcast.setStatus(progress.status());
        broadcast.setTotalRecipients(progress.totalRecipients());
        broadcast.setSentCount(progress.sentCount());
        broadcast.setFailedCount(progress.failedCount());
        broadcast.setBlockedCount(progress.blockedCount());
        broadcast.setErrorMessage(progress.errorMessage());

        if (!progress.status().isActive() && broadcast.getFinishedAt() == null) {
            broadcast.setFinishedAt(Instant.now());
        }
        return broadcast;
    }

    /**
     * SELECTED da ro'yxat MAJBURIY va bo'sh bo'lmasligi kerak.
     *
     * <p>Bo'sh ro'yxatga ruxsat bersak jo'natish "muvaffaqiyatli, 0 kishiga"
     * bo'lib yakunlanardi va admin xabar ketdi deb o'ylardi. Boshqa
     * auditoriyalarda esa ro'yxat e'tiborsiz qoldiriladi — u yerda manzillarni
     * auth-service beradi va bu yerdagi qiymat faqat chalkashtirardi.
     */
    private List<Long> resolveRecipients(Audience audience, List<Long> requested) {
        if (audience != Audience.SELECTED) return List.of();

        List<Long> clean = requested == null ? List.of()
                : requested.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (clean.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Kamida bitta qabul qiluvchi tanlanishi kerak");
        }
        return clean;
    }

    // ----- tekshiruvlar -----

    private List<List<InlineButton>> validateButtons(List<List<ButtonDto>> rows) {
        if (rows == null) return List.of();
        return rows.stream()
                .filter(row -> row != null && !row.isEmpty())
                .map(row -> row.stream().map(button -> {
                    String url = button.url().trim();
                    // Telegram yaroqsiz havolada BUTUN xabarni rad etadi —
                    // bitta tugma jo'natmani boshlanishidayoq to'xtatadi.
                    String scheme = url.toLowerCase(Locale.ROOT);
                    if (!scheme.startsWith("https://") && !scheme.startsWith("http://")
                            && !scheme.startsWith("tg://")) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                                "Havola https:// yoki tg:// bilan boshlanishi kerak: " + url);
                    }
                    return button.toDomain();
                }).toList())
                .toList();
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
