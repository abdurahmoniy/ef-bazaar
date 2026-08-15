package uz.efbazaar.trade.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Resolves display names and avatar availability via auth-service's
 * {@code POST /internal/auth/v1/users/summary/batch}. Mirrors
 * marketplace-service's client of the same name, including its fail-soft
 * posture: any error yields empty and the caller renders without identity.
 *
 * <p>trade-service never queries auth-service's database directly — that is a
 * hard project rule.
 */
@Slf4j
@Component
public class AuthSummaryClient {

    private static final String PATH = "/internal/auth/v1/users/summary/batch";
    private static final String HEADER = "X-Internal-Secret";
    private static final ParameterizedTypeReference<List<UserSummary>> RESPONSE_TYPE =
            new ParameterizedTypeReference<>() {};

    private final RestClient http;
    private final String secret;

    public AuthSummaryClient(@Qualifier("authClient") RestClient http,
                             @Value("${app.auth.internal-secret:}") String secret) {
        this.http = http;
        this.secret = secret;
    }

    public record UserSummary(
            UUID id,
            String displayName,
            String telegramUsername,
            Long telegramId,
            boolean verified,
            Instant createdAt,
            boolean photoAvailable,
            String telegramPhotoUrl) {
        public UserSummary(UUID id, String displayName, String telegramUsername, Long telegramId,
                           boolean verified, Instant createdAt, boolean photoAvailable) {
            this(id, displayName, telegramUsername, telegramId, verified, createdAt, photoAvailable, null);
        }
    }

    /** Empty when the id is unknown, the secret is unset, or auth is unreachable. */
    public Optional<UserSummary> resolve(UUID userId) {
        if (userId == null) return Optional.empty();
        return Optional.ofNullable(resolveAll(List.of(userId)).get(userId));
    }

    /**
     * Batch form used by the catalogue. Unknown ids are simply absent from the
     * returned map; the caller substitutes a placeholder label.
     */
    public Map<UUID, UserSummary> resolveAll(Collection<UUID> userIds) {
        if (userIds == null || userIds.isEmpty() || secret == null || secret.isBlank()) {
            return Map.of();
        }
        try {
            List<UserSummary> result = http.post()
                    .uri(PATH)
                    .header(HEADER, secret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("ids", List.copyOf(userIds)))
                    .retrieve()
                    .body(RESPONSE_TYPE);
            if (result == null) return Map.of();
            return result.stream().collect(Collectors.toMap(UserSummary::id, Function.identity()));
        } catch (Exception e) {
            log.warn("Failed to resolve {} user summaries from auth-service: {}",
                    userIds.size(), e.toString());
            return Map.of();
        }
    }
}
