package uz.efbazaar.bot.settings;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;

/**
 * /start xabarining matni va bannerini marketplace-service'dan o'qiydi.
 *
 * <p>BU YERDA UCHTA HIMOYA QATLAMI BOR va ularning har biri boshqacha
 * nosozlikka javob beradi:
 *
 * <ol>
 *   <li><b>Kesh</b> — matn o'zgarmaguncha saqlanib turadi. /start har
 *       bosilganda marketplace'ga so'rov ketmaydi; kesh Kafka signali bilan
 *       ({@link #refreshNow()}) yangilanadi, {@link #SAFETY_TTL} esa signal
 *       yo'qolgan holat uchun zaxira.</li>
 *   <li><b>Oxirgi ma'lum qiymat</b> — qayta tortish muvaffaqiyatsiz
 *       bo'lsa, ESKI qiymat saqlanib qoladi va ishlatilaveradi. Marketplace
 *       yiqilishi foydalanuvchiga umuman ko'rinmaydi.</li>
 *   <li><b>Standart matn</b> — bot ishga tushgandan beri marketplace bilan
 *       BIRON MARTA ham gaplasha olmagan holat. Faqat shunda ishlatiladi,
 *       shuning uchun ataylab qisqa: uning vazifasi chiroyli ko'rinish emas,
 *       foydalanuvchini bo'sh ekran oldida qoldirmaslik.</li>
 * </ol>
 *
 * <p>Ya'ni bu bog'liqlik /start ni sindira olmaydi — eng yomon holatda matn
 * eskiroq bo'ladi.
 */
@Slf4j
@Component
public class BotSettingsClient {

    /**
     * Zaxira sync oralig'i — normal ish rejimida ISHLATILMAYDI.
     *
     * <p>Kesh odatda Kafka signali bilan yangilanadi, ya'ni matn o'zgarmasa
     * bot marketplace'ni umuman bezovta qilmaydi. Bu taymer faqat signal
     * yo'qolgan holat uchun: bot uzoq o'chib turgan va event retention'dan
     * chiqib ketgan, topik qayta yaratilgan, consumer group reset qilingan.
     * Ularsiz matn ABADIY eskirib qolardi va buni hech kim sezmasdi.
     */
    private static final Duration SAFETY_TTL = Duration.ofHours(6);

    /**
     * So'rov /start javobini kutib turadi, shuning uchun timeout qisqa.
     * Foydalanuvchi uchun 3 soniya kutish — eski matn olishdan yomonroq.
     */
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private static final BotSettingsView FALLBACK = new BotSettingsView(
            "⚽️ <b>efBazaar</b> — eFootball akkountlar bozori\n\n"
                    + "Boshlash uchun pastdagi tugmani bosing 👇",
            null);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    private volatile BotSettingsView cached;
    private volatile Instant refreshAfter = Instant.EPOCH;

    public BotSettingsClient(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public BotSettingsView get() {
        BotSettingsView snapshot = cached;
        if (snapshot != null && Instant.now().isBefore(refreshAfter)) {
            return snapshot;
        }

        BotSettingsView fetched = fetch();
        if (fetched != null) {
            store(fetched);
            return fetched;
        }

        // So'rov muvaffaqiyatsiz. Eski qiymat bo'lsa — o'shani beramiz va
        // keyingi urinishni ham suramiz, aks holda har /start yiqilgan
        // servisga yangi so'rov yuborib, javobni sekinlashtiradi.
        refreshAfter = Instant.now().plus(SAFETY_TTL);
        return snapshot != null ? snapshot : FALLBACK;
    }

    /**
     * Marketplace "sozlama o'zgardi" deb xabar berganda chaqiriladi.
     *
     * <p>Keshni shunchaki "eskirdi" deb belgilamaymiz, DARHOL qayta tortamiz.
     * Ikki sabab: keyingi /start kutib turmaydi, va tortish muvaffaqiyatsiz
     * bo'lsa buni admin saqlagan zahoti logdan bilamiz — foydalanuvchi
     * shikoyat qilgandan keyin emas.
     *
     * @return true — kesh yangilandi
     */
    public boolean refreshNow() {
        BotSettingsView fetched = fetch();
        if (fetched != null) {
            store(fetched);
            return true;
        }
        // Tortib bo'lmadi. Eski qiymat qoladi, lekin keyingi /start uni
        // qayta tortishga urinsin — 6 soat kutmasin.
        refreshAfter = Instant.EPOCH;
        return false;
    }

    private void store(BotSettingsView view) {
        cached = view;
        refreshAfter = Instant.now().plus(SAFETY_TTL);
    }

    private BotSettingsView fetch() {
        if (props.secret() == null || props.secret().isBlank()) {
            log.warn("INTERNAL_API_SECRET sozlanmagan — /start standart matn bilan ishlaydi");
            return null;
        }
        try {
            return marketplaceWebClient.get()
                    .uri("/internal/marketplace/v1/bot-settings")
                    .header("X-Internal-Secret", props.secret())
                    .retrieve()
                    .bodyToMono(BotSettingsView.class)
                    .timeout(TIMEOUT)
                    .block();
        } catch (Exception e) {
            log.warn("Bot sozlamalarini o'qib bo'lmadi ({}), eski qiymat ishlatiladi", e.getMessage());
            return null;
        }
    }

    /**
     * marketplace javobining bizga kerakli qismi.
     *
     * <p>{@code ignoreUnknown} shart: javobda {@code updatedAt} ham bor va
     * WebClient'ning Jackson dekoderi standart holatda noma'lum maydonda
     * xato beradi. Servis kelajakda yangi maydon qo'shsa, bot bu tufayli
     * sinmaydi.
     *
     * @param bannerFileId Telegram file_id, yoki null — bannersiz matnli xabar
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BotSettingsView(String welcomeText, String bannerFileId) {}
}
