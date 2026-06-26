package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirrors {@code AuthEvents.UserRegistered} from auth-service. */
public record UserRegisteredDto(
        UUID userId,
        String username,
        String email,
        Instant occurredAt
) {}
