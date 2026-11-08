package uz.efbazaar.bot.campaign;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;

/**
 * {@code /start c_<kod>} yukini marketplace'ga uzatadi: bosilish yoziladi va
 * kod ro'yxatdan o'tishgacha {@code pending_campaign_attributions} da kutadi.
 *
 * <p>XATO YUTILADI — {@code PendingReferralClient} bilan bir xil sabab: manbani
 * yo'qotish yomon, {@code /start} ni yiqitish yomonroq.
 */
@Slf4j
@Component
public class CampaignStartClient {

    /** So'rov /start javobini kutib turadi, shuning uchun qisqa. */
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public CampaignStartClient(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public void remember(long telegramId, String code) {
        try {
            marketplaceWebClient.post()
                    .uri("/internal/marketplace/v1/campaigns/bot-start")
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(new BotStartRequest(telegramId, code))
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
            log.info("Kampaniya kodi saqlandi: telegramId={} kod={}", telegramId, code);
        } catch (Exception e) {
            log.warn("Kampaniya kodi saqlanmadi (telegramId={}, kod={}): {}",
                    telegramId, code, e.getMessage());
        }
    }

    private record BotStartRequest(long telegramId, String code) {}
}
