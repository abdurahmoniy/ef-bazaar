package uz.efbazaar.marketplace.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Chatda tugallanmagan savdo bormi — trade-service'dan so'raladi.
 *
 * <p>XATO "yo'q" degani EMAS. Chaqiruv yiqilsa tirik deb hisoblaymiz va
 * tozalash rad etiladi: savdo o'rtasida kelishuv yozishmasini yo'qotish
 * qaytarib bo'lmaydigan zarar, tozalashning bir necha daqiqaga kechikishi
 * esa shunchaki noqulaylik.
 */
@Slf4j
@Component
public class TradeLiveClient {

    /** Foydalanuvchi tugmani bosib turibdi — uzoq kutmaymiz. */
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final RestClient http;
    private final String secret;

    public TradeLiveClient(
            @Value("${app.trade.internal-base-url:http://trade-service:8085}") String baseUrl,
            @Value("${app.internal.secret:}") String secret,
            RestClient.Builder builder) {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) TIMEOUT.toMillis());
        factory.setReadTimeout((int) TIMEOUT.toMillis());
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.secret = secret;
    }

    public boolean hasLiveTrade(UUID chatId) {
        try {
            Map<?, ?> body = http.get()
                    .uri("/internal/trades/live?chatId={chatId}", chatId)
                    .header("X-Internal-Secret", secret)
                    .retrieve()
                    .body(Map.class);
            return body != null && Boolean.TRUE.equals(body.get("live"));
        } catch (RuntimeException e) {
            log.warn("Tirik savdo tekshiruvi yiqildi (chat {}): {} — tozalash rad etiladi",
                    chatId, e.getMessage());
            return true;
        }
    }
}
