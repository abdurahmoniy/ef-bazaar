package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirrors {@code AuthEvents.UserRegistered} from auth-service (Telegram-first model). */
public record UserRegisteredDto(
        UUID userId,
        Long telegramId,
        String displayName,
        Instant occurredAt
) {}
