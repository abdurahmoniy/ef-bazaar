package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirrors {@code AuthEvents.GoogleLinked} from auth-service. */
public record GoogleLinkedDto(
        UUID userId,
        Long telegramId,
        String telegramUsername,
        String displayName,
        String email,
        Instant occurredAt
) {}
