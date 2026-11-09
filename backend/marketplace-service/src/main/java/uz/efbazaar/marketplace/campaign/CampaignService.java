package uz.efbazaar.marketplace.campaign;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.campaign.CampaignDtos.CampaignRow;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignClickRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.PendingCampaignAttributionRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.UserAcquisitionRepository;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Kampaniya havolalari: foydalanuvchi qaysi manbadan kelgani.
 *
 * <p>Referal bilan bir xil ikki yo'l: veb ({@code ?c=<kod>} → cookie →
 * login'dan keyin {@link #claim}) va bot ({@code /start c_<kod>} →
 * {@link #rememberBotStart} → ro'yxatdan o'tish hodisasida
 * {@link #claimOnRegistration}).
 *
 * <p>BIRINCHI MANBA G'OLIB, referaldagi "oxirgi bosish" emas. Savol
 * boshqa: referal mukofot kimga tegishini hal qiladi, kampaniya esa
 * odamni platformaga nima olib kelganini o'lchaydi — buni birinchi
 * havola qilgan.
 *
 * <p>DA'VO FAQAT YANGI AKKOUNT UCHUN. Aks holda eski foydalanuvchi
 * guruhdagi yangi postni bosib, o'sha postning "yangi foydalanuvchisi"
 * bo'lib qolardi va kampaniya bermagan natijani ko'rsatardi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CampaignService {

    /** Ro'yxatdan o'tgandan keyin veb da'vosi uchun oyna — referal bilan bir xil. */
    static final Duration CLAIM_WINDOW = Duration.ofHours(1);

    /** O'xshash belgilar yo'q: 0/O va 1/I chiqarib tashlangan. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int LENGTH = 8;
    private static final int MAX_ATTEMPTS = 10;
    private static final Pattern CODE = Pattern.compile("^[A-Z0-9]{8}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final CampaignRepository campaigns;
    private final CampaignClickRepository clicks;
    private final UserAcquisitionRepository acquisitions;
    private final PendingCampaignAttributionRepository pending;
    private final AuthSummaryClient users;

    // ------------------------------------------------------------------
    // Adminka
    // ------------------------------------------------------------------

    public CampaignRow create(String name, Campaign.Kind kind, UUID adminId) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new MarketplaceException(HttpStatus.BAD_REQUEST, "campaign_name_blank", "Kampaniya nomi bo'sh");
        }
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String code = random();
            if (campaigns.existsByCode(code)) continue;
            try {
                return CampaignRow.fresh(campaigns.save(new Campaign(code, trimmed, kind, adminId)));
            } catch (DataIntegrityViolationException e) {
                // Bir vaqtda ikki admin bir xil kodni oldi — keyingisini sinaymiz.
                log.debug("Kampaniya kodi to'qnashdi: {}", code);
            }
        }
        throw new IllegalStateException(
                "Kampaniya kodi yaratilmadi: " + MAX_ATTEMPTS + " urinish to'qnashdi");
    }

    /**
     * Havolani to'xtatadi. O'CHIRMAYDI: kampaniya keltirgan odamlar
     * yo'qolmaydi va uning raqamlari keyingi qaror uchun kerak.
     */
    @Transactional
    public void archive(UUID id) {
        Campaign campaign = campaigns.findById(id)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND, "campaign_not_found", "Kampaniya topilmadi"));
        if (campaign.getArchivedAt() == null) {
            campaign.setArchivedAt(Instant.now());
            campaigns.save(campaign);
        }
    }

    @Transactional(readOnly = true)
    public List<CampaignRow> funnel() {
        return campaigns.funnel().stream().map(CampaignRow::of).toList();
    }

    // ------------------------------------------------------------------
    // Veb yo'li
    // ------------------------------------------------------------------

    /**
     * Saytdagi bosilish. Noma'lum yoki to'xtatilgan kod — sukut, xato emas:
     * havola postda ochiq turadi va istalgan odam uni o'zgartira oladi.
     */
    @Transactional
    public void recordWebClick(String code, UUID userId) {
        active(code).ifPresent(c ->
                clicks.save(new CampaignClick(c.getId(), CampaignClick.Channel.WEB, userId, null)));
    }

    /**
     * @return qator yozilgan bo'lsa true.
     *
     * <p>ATAYLAB {@code @Transactional} EMAS — {@code ReferralService.claim}
     * bilan bir xil sabab: kalit qo'lda beriladi va to'qnashuv aynan
     * {@code save()} dan qaytishi kerak; ustiga auth-service'ga HTTP
     * so'rov DB ulanishini band qilib turmasligi kerak.
     */
    public boolean claim(UUID userId, String code) {
        Optional<Campaign> campaign = active(code);
        if (campaign.isEmpty()) return false;
        if (acquisitions.existsById(userId)) return false;
        if (!isFreshAccount(userId)) return false;

        try {
            acquisitions.save(new UserAcquisition(userId, campaign.get().getId()));
        } catch (DataIntegrityViolationException e) {
            log.debug("Kampaniya biriktirishi allaqachon yozilgan: {}", userId);
            return false;
        }
        log.info("Foydalanuvchi kampaniyaga biriktirildi: {} -> {}", userId, campaign.get().getCode());
        return true;
    }

    /**
     * auth-service javob bermasa YANGI DEB HISOBLANMAYDI: noto'g'ri
     * biriktirish kampaniya natijasini soxtalashtiradi, yo'qolgan
     * biriktirish esa faqat raqamni biroz kamaytiradi.
     */
    private boolean isFreshAccount(UUID userId) {
        Optional<UserSummary> summary = users.resolve(userId);
        if (summary.isEmpty()) {
            log.warn("Kampaniya da'vosi rad etildi: {} uchun auth-service ma'lumot bermadi", userId);
            return false;
        }
        Instant createdAt = summary.get().createdAt();
        return createdAt != null && createdAt.isAfter(Instant.now().minus(CLAIM_WINDOW));
    }

    // ------------------------------------------------------------------
    // Bot yo'li
    // ------------------------------------------------------------------

    /**
     * {@code /start c_<kod>}: bosilish yoziladi va kod ro'yxatdan o'tishgacha
     * kutib turadi. Oxirgi /start g'olib — odam hali akkount ochmagan,
     * shuning uchun "birinchi manba" qoidasi bu yerda emas, biriktirishda.
     */
    @Transactional
    public void rememberBotStart(long telegramId, String code) {
        Optional<Campaign> campaign = active(code);
        if (campaign.isEmpty()) return;
        clicks.save(new CampaignClick(campaign.get().getId(), CampaignClick.Channel.BOT, null, telegramId));
        pending.save(new PendingCampaignAttribution(telegramId, campaign.get().getCode()));
    }

    /**
     * Ro'yxatdan o'tish hodisasi kutilayotgan kodni biriktirishga aylantiradi.
     *
     * <p>Akkount yoshi tekshirilmaydi: hodisaning o'zi signal — u bir marta,
     * faqat yangi akkount uchun otadi. Catch YO'Q, {@code ReferralService}
     * dagi bilan bir xil sabab: poyga tranzaksiyani orqaga qaytaradi, Kafka
     * qayta yetkazadi va ikkinchi urinishda {@code existsById} g'olibni topadi.
     */
    @Transactional
    public void claimOnRegistration(UUID userId, Long telegramId) {
        if (userId == null || telegramId == null) return;

        Optional<PendingCampaignAttribution> waiting = pending.findById(telegramId);
        if (waiting.isEmpty()) return;

        Optional<Campaign> campaign = active(waiting.get().getCode());
        if (campaign.isPresent() && !acquisitions.existsById(userId)) {
            acquisitions.save(new UserAcquisition(userId, campaign.get().getId()));
            log.info("Foydalanuvchi botdan kampaniyaga biriktirildi: {} -> {}",
                    userId, campaign.get().getCode());
        }
        // Ishlatilmagan bo'lsa ham o'chiriladi: bu telegram_id bir marta
        // ro'yxatdan o'tadi va qator boshqa hech qachon ishlamaydi.
        pending.deleteById(telegramId);
    }

    // ------------------------------------------------------------------

    private Optional<Campaign> active(String code) {
        String normalised = normalise(code);
        if (normalised == null) return Optional.empty();
        return campaigns.findByCode(normalised).filter(Campaign::isActive);
    }

    static String normalise(String code) {
        if (code == null) return null;
        String upper = code.trim().toUpperCase();
        return CODE.matcher(upper).matches() ? upper : null;
    }

    private static String random() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
