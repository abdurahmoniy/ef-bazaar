package uz.efbazaar.bot.partner;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.UUID;

/**
 * Joylash natijasini marketplace-service'ga qaytaradi.
 *
 * <p>Muvaffaqiyat ham, muvaffaqiyatsizlik ham YUBORILADI. Pul e'lon
 * joylanmaguncha ushlab turiladi: bot jim qolsa, sotuvchining puli hech
 * narsa e'lon qilinmagan holda abadiy ushlanib qolardi va buni kuzatib
 * turadigan hech kim yo'q.
 */
@Slf4j
@Component
public class ChannelPostResults {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public ChannelPostResults(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public void report(ChannelPostResult result) {
        try {
            marketplaceWebClient.post()
                    .uri("/internal/marketplace/v1/partners/channel-post-result")
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(result)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
            log.info("Kanal e'loni {} natijasi yuborildi: messageId={} error={}",
                    result.postId(), result.telegramMessageId(), result.error());
        } catch (Exception e) {
            log.error("Kanal e'loni {} natijasini yuborib bo'lmadi: {}",
                    result.postId(), e.getMessage());
        }
    }

    /** {@code telegramMessageId} yoki {@code error} — biri to'ldiriladi, ikkisi emas. */
    public record ChannelPostResult(UUID postId, String telegramMessageId, String error) {

        public static ChannelPostResult posted(UUID postId, int telegramMessageId) {
            return new ChannelPostResult(postId, String.valueOf(telegramMessageId), null);
        }

        public static ChannelPostResult failed(UUID postId, String error) {
            return new ChannelPostResult(postId, null, error);
        }
    }
}
