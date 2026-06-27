package uz.efbazaar.auth.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Event payloads produced by auth-service.
 * Topic names: {@code efbazaar.auth.*}.
 */
public final class AuthEvents {

    public static final String TOPIC_USER_REGISTERED  = "efbazaar.auth.user-registered";
    public static final String TOPIC_USER_LOGGED_IN   = "efbazaar.auth.user-logged-in";
    public static final String TOPIC_GOOGLE_LINKED    = "efbazaar.auth.google-linked";

    private AuthEvents() {}

    public record UserRegistered(
            UUID userId,
            Long telegramId,
            String telegramUsername,
            String displayName,
            Instant occurredAt) {}

    public record UserLoggedIn(UUID userId, String method, Instant occurredAt) {}

    public record GoogleLinked(
            UUID userId,
            Long telegramId,
            String telegramUsername,
            String displayName,
            String email,
            Instant occurredAt) {}
}
