package uz.efbazaar.trade.partner;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

/**
 * Savdo ochilayotganda: xaridor bu e'longa qaysi kanaldan kelgan.
 *
 * <p>XATO SAVDONI TO'XTATMAYDI. Bu chaqiruv yiqilsa hamkor ulushi
 * yo'qoladi — yomon, lekin savdoning ochilmasligi ancha yomonroq: ikki
 * odam kelishib turibdi va reklama statistikasi ularni to'sishi
 * mumkin emas.
 */
@Slf4j
@Component
public class PartnerAttributionClient {

    /** Savdo ochilishini kuttirmaydi. */
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    public record Attribution(UUID partnerUserId, int percentBp) {}

    private record Response(UUID partnerChannelId, UUID partnerUserId, int percentBp) {}

    private final RestClient http;
    private final String secret;

    public PartnerAttributionClient(
            @Value("${app.marketplace.internal-base-url:http://marketplace-service:8082}") String baseUrl,
            @Value("${app.internal.secret:}") String secret,
            RestClient.Builder builder) {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) TIMEOUT.toMillis());
        factory.setReadTimeout((int) TIMEOUT.toMillis());
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.secret = secret;
        if (secret == null || secret.isBlank()) {
            // Bo'sh sir bilan chaqiruv KETAVERADI va qabul qiluvchi uni
            // "mismatch" deb rad etadi — tashqaridan bu sozlama xatosi
            // emas, tarmoq nosozligidek ko'rinadi. Aynan shu holat
            // hamkor ulushini jimgina yo'qotib turgan edi.
            log.warn("app.internal.secret sozlanmagan — hamkor attributsiyasi "
                    + "har safar rad etiladi va savdo ulushi yozilmaydi");
        }
    }

    public Optional<Attribution> lookup(UUID listingId, UUID buyerId) {
        if (listingId == null || buyerId == null) return Optional.empty();
        try {
            Response body = http.get()
                    .uri(uri -> uri.path("/internal/marketplace/v1/partners/attribution")
                            .queryParam("listingId", listingId)
                            .queryParam("buyerId", buyerId)
                            .build())
                    .header("X-Internal-Secret", secret)
                    .retrieve()
                    .body(Response.class);

            if (body == null || body.partnerUserId() == null) return Optional.empty();
            return Optional.of(new Attribution(body.partnerUserId(), body.percentBp()));
        } catch (RuntimeException e) {
            log.warn("Hamkor attributsiyasini olib bo'lmadi (e'lon={}, xaridor={}): {}",
                    listingId, buyerId, e.toString());
            return Optional.empty();
        }
    }
}
