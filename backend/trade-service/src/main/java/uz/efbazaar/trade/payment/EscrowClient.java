package uz.efbazaar.trade.payment;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import uz.efbazaar.trade.trade.domain.AdminFeePayer;

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

    /** Check today's commission both before offering a sale and before accepting it. */
    public void validateSaleAmount(long amountUzs) {
        if (amountUzs < 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Eng kam miqdor 5 000 so‘m");
        }
        CommissionTerms terms;
        try {
            terms = http.get().uri("/api/v1/payments/commission")
                    .retrieve().body(CommissionTerms.class);
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Smart-admin xizmat haqini tekshirib bo‘lmadi");
        }
        if (terms == null || !terms.valid()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Smart-admin xizmat haqini tekshirib bo‘lmadi");
        }
        boolean low = amountUzs < terms.bandSom();
        long floor = low ? terms.lowMinSom() : terms.highMinSom();
        double rate = low ? terms.lowRatePercent() : terms.highRatePercent();
        // Payment rounds rates to permille. At 100% or below the fee floor,
        // the commission consumes the whole price; no multiplication needed.
        if (amountUzs <= floor || Math.round(rate * 10) >= 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Smart-admin xizmatidan keyin sizga 0 so‘m qoladi. Sotuv summasini oshiring.");
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record CommissionTerms(Long bandSom, Double lowRatePercent, Double highRatePercent,
                                   Long lowMinSom, Long highMinSom) {
        boolean valid() {
            return bandSom != null && bandSom > 0 && lowMinSom != null && lowMinSom >= 0
                    && highMinSom != null && highMinSom >= 0
                    && lowRatePercent != null && Double.isFinite(lowRatePercent)
                    && lowRatePercent >= 0 && lowRatePercent <= 100
                    && highRatePercent != null && Double.isFinite(highRatePercent)
                    && highRatePercent >= 0 && highRatePercent <= 100;
        }
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
        settle(tradeId, accepterId, proposerId, accepterUzs, feeBaseUzs, null, 0);
    }

    /**
     * The same settlement, sharing part of the commission with the partner
     * whose channel produced the trade.
     *
     * <p>Both values are the ones stamped when the trade opened, not today's
     * configuration: a rate an admin changes mid-flight must not settle a
     * trade on terms nobody agreed to.
     */
    public void settle(UUID tradeId, UUID accepterId, UUID proposerId,
                       long accepterUzs, long feeBaseUzs,
                       UUID partnerUserId, int partnerPercentBp) {
        Map<String, Object> body = new java.util.HashMap<>(Map.of(
                "buyerId", accepterId.toString(),
                "sellerId", proposerId.toString(),
                "priceTiyin", accepterUzs * TIYIN_PER_SOM,
                "feeBaseTiyin", feeBaseUzs * TIYIN_PER_SOM,
                "partnerPercentBp", partnerPercentBp));
        // HashMap, Map.of emas: Map.of null qiymatni qabul qilmaydi, va
        // hamkorsiz savdo — oddiy holat.
        body.put("partnerUserId", partnerUserId == null ? null : partnerUserId.toString());
        call(tradeId, "settle", body);
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Quote(long feeTiyin, long buyerHoldTiyin, long sellerHoldTiyin) {}

    public Quote quote(UUID proposalId, UUID buyer, UUID seller, long priceUzs, long baseUzs, AdminFeePayer payer) {
        try {
            Quote quote = http.post().uri("/internal/trades/{id}/escrow/quote", proposalId)
                    .header("X-Internal-Secret", secret)
                    .body(Map.of("buyerId", buyer, "sellerId", seller,
                            "priceTiyin", Math.multiplyExact(priceUzs, TIYIN_PER_SOM),
                            "feeBaseTiyin", Math.multiplyExact(baseUzs, TIYIN_PER_SOM), "adminFeePayer", payer.name()))
                    .retrieve().body(Quote.class);
            if (quote == null) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Admin haqini tekshirib bo'lmadi");
            return quote;
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Admin haqini tekshirib bo'lmadi");
        }
    }

    public void hold(UUID tradeId, UUID buyer, UUID seller, long priceUzs, long baseUzs,
                     AdminFeePayer payer, Long expectedFeeTiyin) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("buyerId", buyer);
        body.put("sellerId", seller);
        body.put("priceTiyin", Math.multiplyExact(priceUzs, TIYIN_PER_SOM));
        body.put("feeBaseTiyin", Math.multiplyExact(baseUzs, TIYIN_PER_SOM));
        body.put("adminFeePayer", payer.name());
        body.put("expectedFeeTiyin", expectedFeeTiyin);
        call(tradeId, "hold", body);
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
