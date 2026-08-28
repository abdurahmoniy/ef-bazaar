package uz.efbazaar.bot.broadcast;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.UUID;

/**
 * Jo'natish borishini marketplace-service'ga xabar qiladi.
 *
 * <p>Nosozlik jo'natishni TO'XTATMAYDI: adminka biroz eskirgan sonni
 * ko'rsatgani, xabarlar yarim yo'lda uzilib qolganidan yaxshiroq. Keyingi
 * hisobot baribir yuboriladi va sonlar almashtiriladi, ya'ni o'tkazib
 * yuborilgan hisobot o'z-o'zidan tuzaladi.
 */
@Slf4j
@Component
public class BroadcastProgressReporter {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public BroadcastProgressReporter(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public void report(UUID broadcastId, BroadcastProgress progress) {
        try {
            marketplaceWebClient.patch()
                    .uri("/internal/marketplace/v1/bot-broadcasts/{id}/progress", broadcastId)
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(progress)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
        } catch (Exception e) {
            log.warn("Broadcast {} holatini yuborib bo'lmadi: {}", broadcastId, e.getMessage());
        }
    }
}
