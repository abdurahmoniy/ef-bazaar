package uz.efbazaar.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import uz.efbazaar.auth.security.InternalApiProperties;

import java.time.Duration;

/**
 * Login oldidan kirish shartlari (kanal a'zoligi va h.k.) — access-service.
 *
 * <p>FAIL-OPEN: access-service ishlamasa, sekin bo'lsa yoki sozlanmagan
 * bo'lsa login davom etadi. Shartlar — biznes talabi, xavfsizlik chegarasi
 * emas; ularni tekshiradigan servisning nosozligi butun platformaga kirishni
 * to'xtatib qo'ymasligi kerak. Faqat access-service aniq "bajarilmagan" desa
 * login rad etiladi.
 */
@Slf4j
@Component
public class AccessGate {

    private static final Duration CONNECT_TIMEOUT = Duration.ofMillis(500);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(2);

    private final RestClient client;
    private final String secret;
    private final boolean enabled;

    public AccessGate(@Value("${app.access.internal-base-url:}") String baseUrl,
                      InternalApiProperties internal,
                      RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        this.enabled = baseUrl != null && !baseUrl.isBlank();
        this.client = enabled ? builder.baseUrl(baseUrl).requestFactory(factory).build() : null;
        this.secret = internal.secret();
    }

    /** {@code false} — faqat access-service shartlar bajarilmaganini aniq aytganda. */
    public boolean allows(long telegramId) {
        if (!enabled) return true;
        try {
            CheckResult result = client.post()
                    .uri("/internal/access/v1/check")
                    .header("X-Internal-Secret", secret == null ? "" : secret)
                    .body(new CheckRequest(telegramId))
                    .retrieve()
                    .body(CheckResult.class);
            if (result == null) return true;
            if (!result.passed()) {
                log.info("Kirish shartlari bajarilmagan: telegramId={}", telegramId);
            }
            return result.passed();
        } catch (Exception e) {
            log.warn("Kirish shartlari tekshirilmadi — o'tkazib yuborildi (telegramId={}): {}",
                    telegramId, e.getMessage());
            return true;
        }
    }

    record CheckRequest(long telegramId) {}

    record CheckResult(boolean passed) {}
}
