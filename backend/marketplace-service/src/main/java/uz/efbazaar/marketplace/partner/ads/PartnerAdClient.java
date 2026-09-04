package uz.efbazaar.marketplace.partner.ads;

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
 * Reklama pullarini payment-service'da harakatlantiradi.
 *
 * <p>Yo'nalish marketplace → payment, {@code PartnerFeeClient} bilan bir
 * xil. Teskarisi qurilmaydi: payment savdoni yopish uchun marketplace
 * tirik bo'lishiga muhtoj bo'lmasligi kerak.
 */
@Slf4j
@Component
public class PartnerAdClient {

    /** payment-service tiyinda hisoblaydi, marketplace so'mda. */
    private static final BigDecimal TIYIN_PER_SOM = BigDecimal.valueOf(100);

    private final RestClient http;
    private final String secret;

    public PartnerAdClient(@Value("${app.payment.internal-base-url:http://payment-service:8087}") String baseUrl,
                           @Value("${app.internal.secret:}") String secret,
                           RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(20).toMillis());
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.secret = secret;
    }

    /**
     * Butun buyurtma uchun bir yo'la ushlaydi.
     *
     * <p>Mablag' yetmasa payment-service'ning xabari O'ZGARTIRILMASDAN
     * uzatiladi: unda yetishmayotgan summa bor va frontend aynan shu
     * matndan hamyonni to'ldirish havolasini yasaydi.
     */
    public void hold(UUID orderId, UUID sellerId, BigDecimal totalSom) {
        call("/internal/partner-ads/hold",
                new HoldRequest(orderId, sellerId, tiyin(totalSom)));
    }

    public void settle(UUID postId, UUID sellerId, UUID partnerUserId, BigDecimal priceSom) {
        call("/internal/partner-ads/settle",
                new SettleRequest(postId, sellerId, partnerUserId, tiyin(priceSom)));
    }

    public void refund(UUID postId, UUID sellerId, BigDecimal priceSom) {
        call("/internal/partner-ads/refund",
                new RefundRequest(postId, sellerId, tiyin(priceSom)));
    }

    public void monthly(UUID channelId, UUID partnerUserId, BigDecimal amountSom, String period) {
        call("/internal/partner-ads/monthly",
                new MonthlyRequest(channelId, partnerUserId, tiyin(amountSom), period));
    }

    private static long tiyin(BigDecimal som) {
        return som.multiply(TIYIN_PER_SOM).setScale(0, RoundingMode.HALF_UP).longValue();
    }

    private void call(String uri, Object body) {
        try {
            http.post()
                    .uri(uri)
                    .header("X-Internal-Secret", secret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode() == HttpStatus.CONFLICT) {
                // "Hamyonda mablag' yetarli emas — N so'm yetishmayapti"
                // shakli SAQLANADI: frontend uni shu bo'yicha taniydi.
                throw new ResponseStatusException(HttpStatus.CONFLICT, extractMessage(e));
            }
            log.error("Reklama to'lovi bajarilmadi ({}): {} {}",
                    uri, e.getStatusCode(), e.getResponseBodyAsString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "To'lovni amalga oshirib bo'lmadi. Birozdan keyin qayta urinib ko'ring.");
        }
    }

    private String extractMessage(RestClientResponseException e) {
        String body = e.getResponseBodyAsString();
        int at = body.indexOf("\"message\":\"");
        if (at < 0) return "Hamyonda mablag' yetarli emas";
        int start = at + "\"message\":\"".length();
        int end = body.indexOf('"', start);
        return end < 0 ? "Hamyonda mablag' yetarli emas" : body.substring(start, end);
    }

    /**
     * Hamkorga to'langan summalar, oqim bo'yicha.
     *
     * <p>marketplace bu raqamlarning NUSXASINI saqlamaydi: bitta
     * to'lovning ikkita yozuvi vaqt o'tib bir-biridan uzoqlashadi va
     * keyin qaysi biri to'g'ri ekani bilinmaydi. Ledger — yagona
     * manba.
     *
     * <p>Xato bo'lsa NOLLAR qaytadi va panel baribir ochiladi: daromad
     * raqami ko'rinmagani uchun butun panelni yopish o'rinsiz.
     */
    public Earnings earnings(UUID partnerUserId) {
        try {
            EarningsResponse body = http.get()
                    .uri(uri -> uri.path("/internal/partner-ads/earnings")
                            .queryParam("partnerUserId", partnerUserId)
                            .build())
                    .header("X-Internal-Secret", secret)
                    .retrieve()
                    .body(EarningsResponse.class);

            if (body == null) return Earnings.ZERO;
            return new Earnings(som(body.fromPostsTiyin()), som(body.fromTradesTiyin()),
                    som(body.monthlyTiyin()));
        } catch (RuntimeException e) {
            log.warn("Hamkor daromadini o'qib bo'lmadi ({}): {}", partnerUserId, e.toString());
            return Earnings.ZERO;
        }
    }

    public record Earnings(BigDecimal fromPostsSom, BigDecimal fromTradesSom, BigDecimal monthlySom) {
        public static final Earnings ZERO =
                new Earnings(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
    }

    private record EarningsResponse(long fromPostsTiyin, long fromTradesTiyin, long monthlyTiyin) {}

    private static BigDecimal som(long tiyin) {
        return BigDecimal.valueOf(tiyin).divide(TIYIN_PER_SOM, 2, RoundingMode.HALF_UP);
    }

    private record HoldRequest(UUID orderId, UUID sellerId, long totalTiyin) {}
    private record SettleRequest(UUID postId, UUID sellerId, UUID partnerUserId, long priceTiyin) {}
    private record RefundRequest(UUID postId, UUID sellerId, long priceTiyin) {}
    private record MonthlyRequest(UUID channelId, UUID partnerUserId, long amountTiyin, String period) {}
}
