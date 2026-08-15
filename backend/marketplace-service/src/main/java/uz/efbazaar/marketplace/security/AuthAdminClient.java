package uz.efbazaar.marketplace.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.UUID;

/**
 * Who the platform admins are.
 *
 * <p>Notifications are per-user rows, so telling "the admins" something needs a
 * roster, and roles live only in auth-service. Same shape and same secret as
 * {@link AuthNameClient}.
 */
@Slf4j
@Component
public class AuthAdminClient {

    private static final String PATH = "/internal/auth/v1/users/admins";
    private static final String HEADER = "X-Internal-Secret";
    private static final ParameterizedTypeReference<List<AdminSummary>> RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {};

    /** Only the fields a notification needs; auth returns more. */
    public record AdminSummary(UUID id, String displayName, String telegramUsername,
                               Long telegramId) {}

    private final RestClient http;
    private final String secret;

    public AuthAdminClient(@Qualifier("authClient") RestClient http,
                           @Value("${app.auth.internal-secret:}") String secret) {
        this.http = http;
        this.secret = secret;
    }

    /**
     * @return the admins, or an empty list when auth cannot be reached.
     *
     * <p>Empty rather than an exception on purpose: the ticket this is being
     * announced for already exists and its money is already frozen, so failing
     * here must not roll anything back. The Telegram topic is the other half of
     * the alert and does not depend on this call.
     */
    public List<AdminSummary> admins() {
        if (secret == null || secret.isBlank()) {
            log.warn("AuthAdminClient disabled — INTERNAL_API_SECRET is not set; "
                    + "admins will not receive in-app notifications");
            return List.of();
        }
        try {
            List<AdminSummary> result = http.get()
                    .uri(PATH)
                    .header(HEADER, secret)
                    .retrieve()
                    .body(RESPONSE_TYPE);
            return result == null ? List.of() : result;
        } catch (Exception e) {
            log.warn("Failed to list admins from auth-service: {}", e.toString());
            return List.of();
        }
    }
}
