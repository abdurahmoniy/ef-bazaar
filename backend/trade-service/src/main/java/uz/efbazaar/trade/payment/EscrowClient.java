package uz.efbazaar.trade.payment;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Wallet escrow, over payment-service's {@code /internal} API.
 *
 * <p><b>Units.</b> trade-service counts money in so'm ({@code price_uzs}) and
 * payment-service counts it in tiyin. The conversion happens here and nowhere
 * else — one multiplication, in one file, so a 100× error has one place to be.
 *
 * <p>Timeouts are short and explicit. A payment-service that accepts the
 * connection and then hangs would otherwise park a trade thread for as long as
 * it felt like, and a trade that cannot fund itself should fail quickly rather
 * than slowly.
 */
@Slf4j
@Component
public class EscrowClient {

    /** so'm → tiyin. The only place this conversion is made. */
    private static final long TIYIN_PER_SOM = 100;

    private final RestClient http;
    private final String secret;

    public EscrowClient(RestClient.Builder builder,
                        @Value("${app.payment.base-url:http://payment-service:8087}") String baseUrl,
                        @Value("${app.payment.internal-secret:${INTERNAL_API_SECRET:}}") String secret) {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofMillis(500).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(5).toMillis());
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.secret = secret;
    }

    /**
     * Freezes what each party owes.
     *
     * <p>{@code accepterUzs} is the money changing hands — the price on a sale,
     * the surcharge on a swap that has one, zero on a plain swap.
     * {@code feeBaseUzs} is what the platform's cut is worked out from, which
     * on a swap is the listing price rather than anything paid.
     *
     * @throws ResponseStatusException 409 when either wallet cannot cover its
     *         share — the caller must not open the trade
     */
    public void hold(UUID tradeId, UUID accepterId, UUID proposerId,
                     long accepterUzs, long feeBaseUzs) {
        call(tradeId, "hold", Map.of(
                "buyerId", accepterId.toString(),
                "sellerId", proposerId.toString(),
                "priceTiyin", accepterUzs * TIYIN_PER_SOM,
                "feeBaseTiyin", feeBaseUzs * TIYIN_PER_SOM));
    }

    /** Pays the proposer, less the platform's share. */
    public void settle(UUID tradeId, UUID accepterId, UUID proposerId,
                       long accepterUzs, long feeBaseUzs) {
        call(tradeId, "settle", Map.of(
                "buyerId", accepterId.toString(),
                "sellerId", proposerId.toString(),
                "priceTiyin", accepterUzs * TIYIN_PER_SOM,
                "feeBaseTiyin", feeBaseUzs * TIYIN_PER_SOM));
    }

    /** Returns every hold to whoever put it up. */
    public void release(UUID tradeId, UUID accepterId, UUID proposerId,
                        long accepterUzs, long feeBaseUzs) {
        call(tradeId, "release", Map.of(
                "buyerId", accepterId.toString(),
                "sellerId", proposerId.toString(),
                "priceTiyin", accepterUzs * TIYIN_PER_SOM,
                "feeBaseTiyin", feeBaseUzs * TIYIN_PER_SOM));
    }

    private void call(UUID tradeId, String action, Map<String, Object> body) {
        try {
            http.post()
                    .uri("/internal/trades/{id}/escrow/{action}", tradeId, action)
                    .header("X-Internal-Secret", secret)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpStatusCodeException e) {
            // Pass the wallet's own answer through: "not enough money" is a
            // fact the buyer needs, not an internal detail. Anything else is
            // ours to own, so it surfaces as a 502 rather than pretending the
            // caller did something wrong.
            if (e.getStatusCode() == HttpStatus.CONFLICT || e.getStatusCode() == HttpStatus.BAD_REQUEST) {
                throw new ResponseStatusException(e.getStatusCode(), walletMessage(e));
            }
            log.error("Escrow {} failed for trade {}: {}", action, tradeId, e.getStatusCode());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "To'lov xizmati javob bermayapti");
        }
    }

    private static String walletMessage(HttpStatusCodeException e) {
        String body = e.getResponseBodyAsString();
        // ProblemDetail carries the reason in "detail"; fall back to something
        // truthful rather than echoing a raw body at the user.
        int i = body.indexOf("\"detail\":\"");
        if (i < 0) return "Hamyon amalni rad etdi";
        int start = i + 10;
        int end = body.indexOf('"', start);
        return end < 0 ? "Hamyon amalni rad etdi" : body.substring(start, end);
    }
}
