package uz.efbazaar.trade.marketplace;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * What the listing itself says the deal may be.
 *
 * <p>Both facts have to come from marketplace-service rather than the client.
 * The price sets the platform's fee on a swap, and a proposer who could name it
 * would name whatever lands on the cheapest band. {@code exchangeMode} is the
 * seller's own published terms — without checking it, a swap could be opened on
 * an account advertised as sale-only.
 */
@Slf4j
@Component
public class ListingTermsClient {

    private static final String HEADER = "X-Internal-Secret";

    public record ListingTerms(UUID id, UUID sellerId, BigDecimal price,
                               String status, String exchangeMode) {

        /** So'm, rounded down — the fee table works in whole tiyin. */
        public long priceUzs() {
            return price == null ? 0 : price.longValue();
        }

        public boolean allowsSwap() {
            return "EXCHANGE_ONLY".equals(exchangeMode)
                    || "EXCHANGE_WITH_SURCHARGE".equals(exchangeMode)
                    || "BOTH".equals(exchangeMode);
        }

        public boolean allowsSurcharge() {
            return "EXCHANGE_WITH_SURCHARGE".equals(exchangeMode)
                    || "BOTH".equals(exchangeMode);
        }

        /** A listing offered only for swap cannot be bought outright. */
        public boolean allowsSale() {
            return !"EXCHANGE_ONLY".equals(exchangeMode);
        }
    }

    private final RestClient http;
    private final String secret;

    public ListingTermsClient(@Qualifier("marketplaceClient") RestClient http,
                              @Value("${app.auth.internal-secret:}") String secret) {
        this.http = http;
        this.secret = secret;
    }

    /**
     * @throws ResponseStatusException 502 when marketplace cannot be reached —
     *         the terms decide who pays what, so guessing is not an option
     */
    public ListingTerms fetch(UUID listingId) {
        try {
            ListingTerms terms = http.get()
                    .uri("/internal/marketplace/v1/listings/{id}/terms", listingId)
                    .header(HEADER, secret)
                    .retrieve()
                    .body(ListingTerms.class);
            if (terms == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "E'lon shartlarini o'qib bo'lmadi");
            }
            return terms;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Could not read terms for listing {}: {}", listingId, e.toString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "E'lon shartlarini o'qib bo'lmadi — keyinroq urinib ko'ring");
        }
    }
}
