package uz.efbazaar.marketplace.referral;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralCodeRepository;

import java.security.SecureRandom;
import java.util.Optional;
import java.util.UUID;

/**
 * Taklif kodlarini beradi va yechadi.
 *
 * <p>Kod tasodifiy va foydalanuvchi identifikatoridan yasalmagan. Ismdan
 * yasalgan kod ism o'zgarganda buziladi; ketma-ket raqam esa birovning
 * kodini taxmin qilib, uning nomidan taklif qilishga imkon beradi.
 */
@Service
@RequiredArgsConstructor
public class ReferralCodeService {

    /**
     * O'xshash belgilar yo'q: 0/O va 1/I chiqarib tashlangan. Kod
     * kanalda o'qib eshitiladi va qo'lda teriladi.
     */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int LENGTH = 8;
    private static final int MAX_ATTEMPTS = 10;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ReferralCodeRepository codes;

    /**
     * Foydalanuvchining kodi; birinchi murojaatda yaratiladi.
     *
     * <p>ATAYLAB {@code @Transactional} EMAS. Kalit qo'lda beriladi,
     * shuning uchun Hibernate INSERT'ni flush'gacha kechiktiradi — o'rab
     * turuvchi tranzaksiya bo'lsa, u commit paytida otadi va bu yerdagi
     * catch umuman ishlamaydi. Tranzaksiyasiz esa har repozitoriy
     * chaqiruvi o'z tranzaksiyasida ketadi va to'qnashuv aynan
     * {@code save()} dan qaytadi.
     *
     * <p>Poyga haqiqiy: bir vaqtda ochilgan ikki ilova ikkalasi ham
     * qatorni topmaydi va ikkalasi ham boshqa-boshqa kod yozmoqchi
     * bo'ladi. Yutqazgani g'olibning kodini o'qib qaytaradi.
     */
    public String codeFor(UUID userId) {
        Optional<ReferralCode> existing = codes.findById(userId);
        if (existing.isPresent()) return existing.get().getCode();

        try {
            return codes.save(new ReferralCode(userId, freshCode())).getCode();
        } catch (DataIntegrityViolationException e) {
            return codes.findById(userId)
                    .map(ReferralCode::getCode)
                    .orElseThrow(() -> e);
        }
    }

    /**
     * Kod egasini topadi. Noma'lum kod — bo'sh natija, xato emas.
     *
     * <p>IKKINCHI BOSQICH SHU METODNI KENGAYTIRADI, yangisini qurmaydi.
     * Kanaldagi e'lon posti havolasi ({@code /l/<e'lon>?p=<kod>}) hamkor
     * kanalining kodini olib yuradi, u esa {@code partner_channels}
     * jadvalida turadi — bugun mavjud emas. O'sha kunda bu metod avval
     * {@code user_referral_codes} dan, topilmasa kanal kodlaridan
     * qidiradigan bo'ladi va kanal egasini qaytaradi.
     *
     * <p>Brauzer tarafi allaqachon tayyor: {@code ?ref=} ham, {@code ?p=}
     * ham bir xil joyga yoziladi va bir xil da'vo yo'lidan o'tadi. Ya'ni
     * kanaldan kelgan odam uchun o'zgarishi kerak bo'lgan yagona narsa —
     * shu yechish. Ikkinchi, parallel yo'l qurilsa "kim taklif qildi"
     * degan bitta savolga ikki joyda ikki xil javob paydo bo'ladi.
     */
    public Optional<UUID> resolve(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        return codes.findByCode(code.trim().toUpperCase()).map(ReferralCode::getUserId);
    }

    private String freshCode() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String candidate = random();
            if (!codes.existsByCode(candidate)) return candidate;
        }
        // 32^8 variantdan keyin ham to'qnashuv — bu tasodif emas, nosozlik.
        // Jimgina takroriy kod berishdan ko'ra yiqilgani yaxshi: takroriy
        // kod ikki odamning referalini bir-biriga aralashtiradi.
        throw new IllegalStateException(
                "Referal kodi yaratilmadi: " + MAX_ATTEMPTS + " urinish to'qnashdi");
    }

    private String random() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
