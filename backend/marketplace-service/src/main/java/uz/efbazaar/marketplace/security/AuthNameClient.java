package uz.efbazaar.marketplace.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Resolves user IDs to display names by calling auth-service's
 * {@code POST /internal/auth/v1/users/names/batch}. Fail-soft: on any error
 * the caller receives an empty map (and can fall back to a role label).
 *
 * <p>The shared secret comes from {@code app.auth.internal-secret}. If the
 * secret is unset the client short-circuits without a network call — matches
 * the fail-closed posture of {@code InternalSecretFilter} on the other side.
 */
@Slf4j
@Component
public class AuthNameClient {

    private static final String PATH = "/internal/auth/v1/users/names/batch";
    private static final String HEADER = "X-Internal-Secret";
    private static final ParameterizedTypeReference<Map<UUID, String>> RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {};

    private final RestClient http;
    private final String secret;

    public AuthNameClient(@Qualifier("authClient") RestClient http,
                          @Value("${app.auth.internal-secret:}") String secret) {
        this.http = http;
        this.secret = secret;
    }

    public Map<UUID, String> resolveNames(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        if (secret == null || secret.isBlank()) {
            log.debug("AuthNameClient disabled — app.auth.internal-secret is blank");
            return Map.of();
        }
        try {
            Map<UUID, String> result = http.post()
                    .uri(PATH)
                    .header(HEADER, secret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new Body(List.copyOf(ids)))
                    .retrieve()
                    .body(RESPONSE_TYPE);
            return result == null ? Map.of() : result;
        } catch (Exception e) {
            log.warn("Failed to resolve display names from auth-service: {}", e.toString());
            return Map.of();
        }
    }

    private record Body(List<UUID> ids) {}
}
