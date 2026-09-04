package uz.efbazaar.bot.partner;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.UUID;

/**
 * Kunlik yangilanish natijasini marketplace-service'ga qaytaradi.
 *
 * <p>MUVAFFAQIYATSIZLIK HAM yuboriladi. Jim qolsak, botsiz kanal
 * ro'yxatda abadiy qolar va sotuvchi unga pul to'lab e'lon buyurtma
 * qilardi — post esa hech qachon chiqmasdi.
 */
@Slf4j
@Component
public class ChannelRefreshResults {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public ChannelRefreshResults(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public void report(ChannelRefreshResult result) {
        try {
            marketplaceWebClient.post()
                    .uri("/internal/marketplace/v1/partners/channel-refreshed")
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(result)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
        } catch (Exception e) {
            // Marketplace javob bermadi. Ertaga qayta uriniladi va
            // hisoblagich ham o'smaydi — BIZNING nosozligimiz uchun
            // hamkorlik to'xtamasligi kerak.
            log.error("Kanal {} yangilanishini yuborib bo'lmadi: {}",
                    result.partnerChannelId(), e.getMessage());
        }
    }

    /**
     * {@code subscriberCount} bo'sh bo'lsa — o'qib bo'lmadi degani,
     * va {@code error} sababini aytadi.
     */
    public record ChannelRefreshResult(
            UUID partnerChannelId,
            String title,
            String username,
            String photoFileId,
            Integer subscriberCount,
            String error) {

        public static ChannelRefreshResult read(UUID partnerChannelId, String title,
                                                String username, String photoFileId,
                                                int subscriberCount) {
            return new ChannelRefreshResult(partnerChannelId, title, username,
                    photoFileId, subscriberCount, null);
        }

        public static ChannelRefreshResult failed(UUID partnerChannelId, String error) {
            return new ChannelRefreshResult(partnerChannelId, null, null, null, null, error);
        }
    }
}
