package uz.efbazaar.marketplace.botsettings;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.botsettings.BotSettingsDtos.UpdateBotSettingsRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.service.MediaService;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Telegram botining /start xabarini boshqaradi.
 *
 * <p>Bu servisning asosiy vazifasi saqlash emas, TEKSHIRISH. Matn to'g'ridan-
 * to'g'ri Telegram API'ga ketadi va u yerda xato bo'lsa API butun xabarni rad
 * etadi — natijada /start HECH KIMGA ishlamay qoladi va buni faqat kimdir
 * shikoyat qilganda bilamiz. Shuning uchun noto'g'ri matn adminkada, saqlash
 * paytida to'xtatilishi kerak.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BotSettingsService {

    /**
     * Telegram RASM IZOHI uchun chegara. Banner qo'yilganda amal qiladi.
     */
    static final int CAPTION_MAX_LENGTH = 1024;

    /**
     * Bannersiz oddiy matnli xabar uchun chegara — to'rt barobar kengroq.
     *
     * <p>Ikki chegaraning borligi o'zi tuzoq: matn bannersiz saqlanib,
     * keyin banner yoqilsa bir zumda noto'g'ri bo'lib qoladi. Shuning uchun
     * tekshiruv IKKI TOMONLAMA — matn saqlanayotganda banner bormi deb
     * qaraladi, banner yuklanayotganda esa matn sig'adimi deb qaraladi.
     * Ikkinchisi unutilsa banner yuklash /start ni sindiradi va sabab
     * butunlay boshqa joyda ko'rinadi.
     */
    static final int TEXT_MAX_LENGTH = 4096;

    /**
     * Telegram HTML'ning TO'LIQ ro'yxati. Brauzer noma'lum tegni e'tiborsiz
     * qoldiradi, Telegram esa butun so'rovni "can't parse entities" bilan rad
     * etadi — ya'ni bitta &lt;div&gt; /start ni o'chiradi.
     */
    private static final Set<String> ALLOWED_TAGS = Set.of(
            "b", "strong", "i", "em", "u", "ins", "s", "strike", "del",
            "a", "code", "pre", "blockquote", "span", "tg-spoiler");

    private static final Pattern TAG = Pattern.compile("</?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>");

    private final BotSettingsRepository repository;
    private final MediaService mediaService;
    private final MarketplaceEventPublisher events;

    @Transactional(readOnly = true)
    public BotSettings get() {
        return repository.findById(BotSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException(
                        "bot_settings qatori yo'q — V36 migratsiyasi ishlamagan"));
    }

    @Transactional
    public BotSettings updateWelcomeText(UpdateBotSettingsRequest request, UUID adminId) {
        String text = request.welcomeText().strip();
        validateHtml(text);

        BotSettings settings = get();
        validateLength(text, settings.getBannerFileId() != null);

        settings.setWelcomeText(text);
        touch(settings, adminId);
        log.info("Bot welcome text updated by admin={} length={}", adminId, plainLength(text));
        return settings;
    }

    /**
     * Bannerni almashtiradi: rasm Telegram'ga yuklanadi va bizda faqat
     * qaytgan {@code file_id} qoladi.
     *
     * <p>Eski file_id shunchaki almashtiriladi. Telegram'dagi eski rasmni
     * o'chirmaymiz — u media topikida audit izi bo'lib qoladi va uni
     * o'chirish bannerni tiklash imkonini yo'q qilardi.
     */
    @Transactional
    public BotSettings updateBanner(MultipartFile file, UUID adminId) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rasm tanlanmagan");
        }
        // Telegram rasmni o'zi siqadi, lekin 10 MB'dan kattasini qabul qilmaydi.
        if (file.getSize() > 10L * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rasm 10 MB dan katta");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Faqat rasm yuklash mumkin");
        }

        // Banner qo'shilishi chegarani 4096 dan 1024 ga tushiradi. Mavjud matn
        // sig'masa, rasmni Telegramga YUKLASHDAN OLDIN to'xtaymiz — aks holda
        // media topikida keraksiz rasm qolar, sozlama esa saqlanmasdi.
        BotSettings settings = get();
        validateLength(settings.getWelcomeText(), true);

        // Media topikiga yuklaymiz — bu yerda `listingId` yo'q, chunki banner
        // hech qanday e'longa tegishli emas.
        List<String> fileIds = mediaService.uploadToBot(List.of(file), "Bot banner", null);

        settings.setBannerFileId(fileIds.get(0));
        touch(settings, adminId);
        log.info("Bot banner updated by admin={}", adminId);
        return settings;
    }

    @Transactional
    public BotSettings removeBanner(UUID adminId) {
        BotSettings settings = get();
        settings.setBannerFileId(null);
        touch(settings, adminId);
        log.info("Bot banner removed by admin={}", adminId);
        return settings;
    }

    /**
     * Har o'zgarishda bir joyda: vaqt tamg'asi, muallif va bot uchun signal.
     *
     * <p>Event shu yerdan chiqadi, har chaqiruvchidan alohida emas — yangi
     * mutatsiya qo'shilganda uni yuborishni unutish mumkin bo'lmasin.
     *
     * <p>EVENT TRANZAKSIYA YAKUNLANGANDAN KEYIN CHIQADI. Bu yerda oddiy
     * {@code send} qilib bo'lmaydi: bu metod {@code @Transactional} ichida
     * ishlaydi, Kafka esa darhol yuboradi. Natijada poyga chiqadi —
     *
     * <pre>
     *   1. matn o'zgartirildi (hali commit bo'lmagan)
     *   2. event ketdi
     *   3. bot eshitdi va sozlamani so'radi
     *   4. bot ESKI matnni o'qidi — commit hali bo'lmagan
     *   5. bot uni 6 SOATGA keshladi
     *   6. tranzaksiya commit bo'ldi, lekin botga aytadigan hech kim yo'q
     * </pre>
     *
     * <p>Ya'ni admin saqlagan matn olti soat ko'rinmay qolardi va buni hech
     * narsa ko'rsatmasdi — zaxira sync aynan shu holatga qarshi qo'yilgan
     * edi, bu yerda esa u nosozlikni yashirib qo'yardi.
     */
    private void touch(BotSettings settings, UUID adminId) {
        settings.setUpdatedAt(Instant.now());
        settings.setUpdatedBy(adminId);

        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            // Tranzaksiyasiz chaqiruv (masalan sinov) — kutadigan narsa yo'q.
            events.botSettingsUpdated(adminId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                events.botSettingsUpdated(adminId);
            }
        });
    }

    // ----- tekshiruvlar -----

    /**
     * Telegram uzunlikni HTML teglarsiz sanaydi va UTF-16 birliklarida —
     * Java {@code String.length()} aynan shuni qaytaradi, shuning uchun
     * qo'shimcha hisob-kitob kerak emas. Emoji ikkita birlik egallaydi.
     */
    void validateLength(String text, boolean withBanner) {
        int limit = withBanner ? CAPTION_MAX_LENGTH : TEXT_MAX_LENGTH;
        int length = plainLength(text);
        if (length <= limit) return;

        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, withBanner
                ? "Matn " + length + " belgi. Banner qo'yilganda Telegram izoh uchun "
                        + CAPTION_MAX_LENGTH + " belgiga ruxsat beradi — matnni qisqartiring "
                        + "yoki bannerni olib tashlang."
                : "Matn " + length + " belgi. Telegram xabar uchun maksimum "
                        + TEXT_MAX_LENGTH + " belgiga ruxsat beradi.");
    }

    private int plainLength(String text) {
        return TAG.matcher(text).replaceAll("").length();
    }

    /**
     * Teglar ruxsat etilganmi va yopilganmi — shuni tekshiradi.
     *
     * <p>To'liq HTML tahlilchisi emas va bo'lishi ham shart emas: maqsad
     * Telegram rad etadigan matnni saqlanishidan oldin tutib qolish.
     */
    // Paket ichida ochiq: ommaviy xabar ham xuddi shu tekshiruvdan o'tadi.
    void validateHtml(String text) {
        Matcher matcher = TAG.matcher(text);
        Deque<String> open = new ArrayDeque<>();

        while (matcher.find()) {
            String raw = matcher.group();
            String name = matcher.group(1).toLowerCase(Locale.ROOT);

            if (!ALLOWED_TAGS.contains(name)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "<" + name + "> tegini Telegram qo'llab-quvvatlamaydi. "
                                + "Ruxsat etilgan: " + String.join(", ", ALLOWED_TAGS.stream().sorted().toList()));
            }
            if (raw.startsWith("</")) {
                if (open.isEmpty() || !open.pop().equals(name)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "</" + name + "> yopuvchi tegi ochilgan tegga mos kelmadi");
                }
            } else if (!raw.endsWith("/>")) {
                open.push(name);
            }
        }

        if (!open.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "<" + open.peek() + "> tegi yopilmagan");
        }
    }
}
