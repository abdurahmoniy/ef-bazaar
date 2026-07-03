package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Local mirror of auth-service's {@code UserDeleted} event, consumed to purge
 * marketplace state (listings, chats) belonging to the removed user.
 */
public record UserDeletedDto(
        UUID userId,
        Long telegramId,
        String email,
        Instant occurredAt
) {}
