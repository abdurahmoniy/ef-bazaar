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

    /**
     * Telegram chat id bo'yicha foydalanuvchi.
     *
     * <p>Bot faqat Telegram identifikatorlarini biladi (kanalga kim
     * qo'shganini `my_chat_member` shundan aytadi), platformadagi ariza esa
     * UUID bo'yicha turadi — bu ikkisi orasidagi ko'prik.
     *
     * <p>Xatolikda bo'sh qaytadi, boshqa chaqiruvlar kabi: kanal tekshiruvi
     * kechikkani hech narsani buzmaydi, foydalanuvchi qayta urinadi.
     */
    public Optional<UserSummary> resolveByTelegramId(Long telegramId) {
        if (telegramId == null) return Optional.empty();
        try {
            return Optional.ofNullable(http.get()
                    .uri("/internal/auth/v1/users/by-telegram-id/{id}", telegramId)
                    .header(HEADER, secret)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(UserSummary.class));
        } catch (Exception e) {
            log.warn("Telegram id {} bo'yicha foydalanuvchi topilmadi: {}", telegramId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Like {@link #resolveByTelegramId} but keeps "not linked" (404, empty) apart
     * from "cannot tell" (auth down, timeout, rejected secret — throws 503).
     * The inline picker tells an unlinked user to link Telegram; saying that to a
     * linked user during an auth restart would be wrong.
     */
    public Optional<UserSummary> lookupByTelegramId(Long telegramId) {
        if (telegramId == null) return Optional.empty();
        try {
            return Optional.ofNullable(http.get()
                    .uri("/internal/auth/v1/users/by-telegram-id/{id}", telegramId)
                    .header(HEADER, secret)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(UserSummary.class));
        } catch (org.springframework.web.client.HttpClientErrorException.NotFound e) {
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Telegram id bo'yicha foydalanuvchini tekshirib bo'lmadi: {}", e.getMessage());
            throw new uz.efbazaar.marketplace.exception.MarketplaceException(
                    org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "telegram_check_unavailable",
                    "Telegram ulanishini tekshirib bo'lmadi. Qayta urinib ko'ring.");
        }
    }

    /** Fresh identity check for actions that require Telegram notifications. Never fail open. */
    public void requireTelegramLinked(UUID userId) {
        UserSummary user = resolve(userId).orElseThrow(() ->
                new uz.efbazaar.marketplace.exception.MarketplaceException(
                        org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                        "telegram_check_unavailable",
                        "Telegram ulanishini tekshirib bo'lmadi. Qayta urinib ko'ring."));
        if (user.telegramId() == null) {
            throw new uz.efbazaar.marketplace.exception.MarketplaceException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "telegram_required",
                    "Davom etish uchun Telegram akkauntingizni ulang.");
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
