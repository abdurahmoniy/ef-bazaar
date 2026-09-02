package uz.efbazaar.bot.referral;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;

/**
 * Botga kelgan taklif kodini marketplace'ga uzatadi.
 *
 * <p>Botda baza yo'q, shuning uchun kod bu yerda saqlanmaydi — u
 * marketplace'dagi {@code pending_referrals} ga boradi va odam
 * ro'yxatdan o'tganda haqiqiy referalga aylanadi.
 *
 * <p>XATO YUTILADI. Referalni yo'qotish yomon, lekin {@code /start} ni
 * yiqitish yomonroq: odam botga birinchi marta kirganida hech qanday
 * javob ko'rmasdi. Kod yo'qolsa, u shunchaki referalsiz ro'yxatdan
 * o'tadi — {@code ChannelVerifier} ham xuddi shunday qiladi.
 */
@Slf4j
@Component
public class PendingReferralClient {

    /** So'rov /start javobini kutib turadi, shuning uchun qisqa. */
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public PendingReferralClient(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public void remember(long telegramId, String code) {
        try {
            marketplaceWebClient.post()
                    .uri("/internal/marketplace/v1/referrals/pending")
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(new PendingRequest(telegramId, code))
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
            log.info("Taklif kodi saqlandi: telegramId={} kod={}", telegramId, code);
        } catch (Exception e) {
            log.warn("Taklif kodi saqlanmadi (telegramId={}, kod={}): {}",
                    telegramId, code, e.getMessage());
        }
    }

    private record PendingRequest(long telegramId, String code) {}
}
