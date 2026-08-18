package uz.efbazaar.marketplace.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Resolves user identity summaries via auth-service's
 * {@code POST /internal/auth/v1/users/summary/batch}. Same fail-soft posture
 * as {@link AuthNameClient}: any error yields empty and the Gamer Card
 * renders with stats but without identity details.
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

    public Optional<UserSummary> resolve(UUID userId) {
        if (userId == null) return Optional.empty();
        return Optional.ofNullable(resolveAll(List.of(userId)).get(userId));
    }

    public Map<UUID, UserSummary> resolveAll(java.util.Collection<UUID> userIds) {
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
            Map<UUID, UserSummary> map = new java.util.LinkedHashMap<>();
            for (UserSummary summary : result) {
                if (summary.id() != null) {
                    map.put(summary.id(), summary);
                }
            }
            return map;
        } catch (Exception e) {
            log.warn("Failed to resolve user summaries from auth-service: {}", e.toString());
            return Map.of();
        }
    }
}
