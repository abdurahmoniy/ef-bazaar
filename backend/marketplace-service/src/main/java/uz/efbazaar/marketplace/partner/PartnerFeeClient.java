package uz.efbazaar.marketplace.partner;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.UUID;

/**
 * Hamkorlik to'lovini payment-service'dagi hamyondan yechadi.
 *
 * <p>Pul yo'li ikkinchi marta qurilmaydi: hamyon, ledger va invoice
 * allaqachon bor va savdolar ham shu yerdan yechiladi.
 */
@Slf4j
@Component
public class PartnerFeeClient {

    /** payment-service tiyinda hisoblaydi, marketplace so'mda. */
    private static final BigDecimal TIYIN_PER_SOM = BigDecimal.valueOf(100);

    private final RestClient http;
    private final String secret;

    public PartnerFeeClient(@Value("${app.payment.internal-base-url:http://payment-service:8087}") String baseUrl,
                            @Value("${app.internal.secret:}") String secret,
                            RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(20).toMillis());
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.secret = secret;
    }

    /**
     * To'lovni yechadi.
     *
     * <p>Mablag' yetmasa payment-service'ning xabari O'ZGARTIRILMASDAN
     * uzatiladi: unda yetishmayotgan summa bor va frontend aynan shu
     * matndan hamyonni to'ldirish havolasini yasaydi (savdolarda ham
     * shunday ishlaydi).
     */
    public void charge(UUID applicationId, UUID userId, BigDecimal priceSom) {
        long feeTiyin = priceSom.multiply(TIYIN_PER_SOM).setScale(0, RoundingMode.HALF_UP).longValue();
        if (feeTiyin <= 0) return;

        try {
            http.post()
                    .uri("/internal/partners/charge")
                    .header("X-Internal-Secret", secret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new ChargeRequest(applicationId, userId, feeTiyin))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode() == HttpStatus.CONFLICT) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, extractMessage(e));
            }
            log.error("Hamkorlik to'lovi yechilmadi (ariza={}): {} {}",
                    applicationId, e.getStatusCode(), e.getResponseBodyAsString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "To'lovni amalga oshirib bo'lmadi. Birozdan keyin qayta urinib ko'ring.");
        }
    }

    /**
     * payment-service xatosining matni. Topilmasa umumiy xabar — lekin
     * "mablag' yetarli emas" shakli saqlanadi, chunki frontend uni
     * shu bo'yicha taniydi.
     */
    private String extractMessage(RestClientResponseException e) {
        String body = e.getResponseBodyAsString();
        int at = body.indexOf("\"message\":\"");
        if (at < 0) return "Hamyonda mablag' yetarli emas";
        int start = at + "\"message\":\"".length();
        int end = body.indexOf('"', start);
        return end < 0 ? "Hamyonda mablag' yetarli emas" : body.substring(start, end);
    }

    private record ChargeRequest(UUID applicationId, UUID userId, long feeTiyin) {}
}
