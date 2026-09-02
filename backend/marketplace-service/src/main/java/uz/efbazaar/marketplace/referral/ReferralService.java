package uz.efbazaar.marketplace.referral;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Referal da'vosi.
 *
 * <p>DA'VO FAQAT YANGI AKKOUNT UCHUN. Aks holda uch yil oldin ro'yxatdan
 * o'tgan odam bugun havolani bosib, kimningdir referaliga aylanib
 * qolardi — uni hech kim olib kelmagan bo'lsa ham.
 *
 * <p>Akkount yoshini brauzerdan kelgan "bu ro'yxatdan o'tish edi"
 * bayrog'i emas, auth-service aytadi. Bayroqni yolg'on qo'yishga sababi
 * bor yagona tomon aynan klient.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReferralService {

    /**
     * Ro'yxatdan o'tgandan keyin da'vo qilish uchun berilgan vaqt.
     *
     * <p>Bir soat — brauzer so'rovi kechikishi yoki foydalanuvchi
     * sahifani qayta yuklashi uchun yetarlicha keng, eski akkountni
     * ichkariga kiritish uchun juda tor.
     */
    private static final Duration CLAIM_WINDOW = Duration.ofHours(1);

    private final ReferralRepository referrals;
    private final ReferralCodeService codes;
    private final ReferralSettingsRepository settingsRepository;
    private final AuthSummaryClient users;
    private final ReferralRewardClient rewards;

    /** @return qator yozilgan bo'lsa true. Rad etish xato emas — sukut. */
    @Transactional
    public boolean claim(UUID claimantId, String code) {
        Optional<UUID> referrer = codes.resolve(code);
        if (referrer.isEmpty()) return false;
        if (referrer.get().equals(claimantId)) return false;
        if (referrals.findById(claimantId).isPresent()) return false;
        if (!isFreshAccount(claimantId)) return false;

        try {
            referrals.save(new Referral(claimantId, referrer.get(), null));
        } catch (DataIntegrityViolationException e) {
            // Ikki so'rov bir vaqtda kelgan: birinchisi yozdi, ikkinchisi
            // birlamchi kalitga urildi. Natija to'g'ri, aytadigan xato yo'q.
            log.debug("Referal da'vosi allaqachon yozilgan: {}", claimantId);
            return false;
        }
        log.info("Referal yozildi: {} -> {}", referrer.get(), claimantId);
        return true;
    }

    /**
     * Akkount da'vo oynasi ichida yaratilganmi.
     *
     * <p>auth-service javob bermasa YANGI DEB HISOBLANMAYDI. Xatoni
     * yutib "ha, yangi" desak, auth o'chgan paytda har qanday eski
     * foydalanuvchi referalga aylanib qolardi. Bu holatda referalni
     * yo'qotamiz — noto'g'ri biriktirishdan ko'ra arzonroq.
     */
    private boolean isFreshAccount(UUID userId) {
        try {
            return users.resolve(userId)
                    .map(u -> u.createdAt() != null
                            && u.createdAt().isAfter(Instant.now().minus(CLAIM_WINDOW)))
                    .orElse(false);
        } catch (RuntimeException e) {
            log.warn("Akkount yoshini aniqlab bo'lmadi, referal yozilmadi: {}", userId, e);
            return false;
        }
    }

    ReferralSettings settings() {
        return settingsRepository.findById(ReferralSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("referral_settings qatori yo'q"));
    }
}
