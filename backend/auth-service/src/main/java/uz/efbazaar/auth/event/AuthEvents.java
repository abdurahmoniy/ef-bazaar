package uz.efbazaar.auth.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Event payloads produced by auth-service.
 * Topic names: {@code efbazaar.auth.*}.
 */
public final class AuthEvents {

    public static final String TOPIC_USER_REGISTERED = "efbazaar.auth.user-registered";
    public static final String TOPIC_USER_LOGGED_IN = "efbazaar.auth.user-logged-in";
    public static final String TOPIC_TELEGRAM_LINKED = "efbazaar.auth.telegram-linked";

    private AuthEvents() {}

    public record UserRegistered(UUID userId, String username, String email, Instant occurredAt) {}

    public record UserLoggedIn(UUID userId, Instant occurredAt) {}

    public record TelegramLinked(UUID userId, Long telegramId, Instant occurredAt) {}
}
