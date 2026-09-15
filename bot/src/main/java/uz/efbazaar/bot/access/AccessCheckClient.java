package uz.efbazaar.bot.access;

import io.netty.channel.ChannelOption;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.List;

/**
 * Kirish shartlari (kanal a'zoligi) — access-service.
 *
 * <p>FAIL-OPEN: servis javob bermasa bo'sh ro'yxat qaytadi va {@code /start}
 * odatdagidek ishlaydi. Shartlar tekshiruvining nosozligi botni hech kimga
 * yopib qo'ymasligi kerak (auth-service'dagi AccessGate bilan bir xil qoida).
 */
@Slf4j
@Component
public class AccessCheckClient {

    /** So'rov foydalanuvchi /start javobini kutib turganda ketadi. */
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final WebClient client;
    private final BotSettingsProperties props;

    public AccessCheckClient(@Value("${app.access.internal-base-url:}") String baseUrl,
                             BotSettingsProperties props) {
        this.props = props;
        if (baseUrl == null || baseUrl.isBlank()) {
            this.client = null;
            return;
        }
        HttpClient http = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 1_000)
                .responseTimeout(TIMEOUT);
        this.client = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(http))
                .build();
    }

    /** Bajarilmagan shartlar. Bo'sh — hammasi bajarilgan yoki tekshirib bo'lmadi. */
    public List<Requirement> unmet(long telegramId) {
        if (client == null || telegramId <= 0) return List.of();
        try {
            CheckResult result = client.post()
                    .uri("/internal/access/v1/check")
                    .header("X-Internal-Secret", props.secret() == null ? "" : props.secret())
                    .bodyValue(new CheckRequest(telegramId))
                    .retrieve()
                    .bodyToMono(CheckResult.class)
                    .timeout(TIMEOUT)
                    .block();
            if (result == null || result.passed() || result.unmet() == null) return List.of();
            return result.unmet();
        } catch (Exception e) {
            log.warn("Kirish shartlari tekshirilmadi — o'tkazib yuborildi (telegramId={}): {}",
                    telegramId, e.getMessage());
            return List.of();
        }
    }

    public record Requirement(String title, String username, String url) {
        public String label() {
            if (title != null && !title.isBlank()) return title;
            return username != null ? "@" + username : "Kanal";
        }
    }

    private record CheckRequest(long telegramId) {}

    private record CheckResult(boolean passed, List<Requirement> unmet) {}
}
