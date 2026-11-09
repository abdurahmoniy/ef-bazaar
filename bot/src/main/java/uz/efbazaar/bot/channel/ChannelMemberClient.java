package uz.efbazaar.bot.channel;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;

/**
 * Obuna hodisasini marketplace'ga yozadi. Xato yutiladi: statistika uchun
 * update jarayonini to'xtatib bo'lmaydi.
 */
@Slf4j
@Component
public class ChannelMemberClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public ChannelMemberClient(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public void report(long channelId, String channelUsername, long telegramId,
                       ChannelMemberTracker.Kind kind, long unixSeconds) {
        try {
            marketplaceWebClient.post()
                    .uri("/internal/marketplace/v1/channel-members/events")
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(new Event(channelId, channelUsername, telegramId, kind.name(), unixSeconds))
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
        } catch (Exception e) {
            log.warn("Kanal obuna hodisasi yozilmadi (kanal={}, telegramId={}, {}): {}",
                    channelId, telegramId, kind, e.getMessage());
        }
    }

    private record Event(long channelId, String channelUsername, long telegramId, String kind, long occurredAt) {}
}
