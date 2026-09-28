package uz.efbazaar.trade.marketplace;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Obmenda xaridor beradigan akkount — marketplace'ning o'z ma'lumoti.
 *
 * <p>Egasi va holati klientdan olinmaydi: aks holda xaridor birovning
 * akkountini "beraman" deb yozib, sotuvchini aldashi mumkin edi.
 */
@Slf4j
@Component
public class AccountSummaryClient {

    private static final String HEADER = "X-Internal-Secret";

    public record AccountSummary(UUID id, UUID ownerId, String status, String title,
                                 String coverMessageId, String summary,
                                 Integer teamStrength, UUID currentListingId) {}

    private final RestClient http;
    private final String secret;

    public AccountSummaryClient(@Qualifier("marketplaceClient") RestClient http,
                                @Value("${app.auth.internal-secret:}") String secret) {
        this.http = http;
        this.secret = secret;
    }

    public AccountSummary fetch(UUID accountId) {
        try {
            AccountSummary summary = http.get()
                    .uri("/internal/marketplace/v1/accounts/{id}", accountId)
                    .header(HEADER, secret)
                    .retrieve()
                    .body(AccountSummary.class);
            if (summary == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Akkountni o'qib bo'lmadi");
            }
            return summary;
        } catch (HttpClientErrorException.NotFound e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu akkount sizga tegishli emas yoki faol emas");
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Could not read account {}: {}", accountId, e.toString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Akkountni o'qib bo'lmadi — keyinroq urinib ko'ring");
        }
    }
}
