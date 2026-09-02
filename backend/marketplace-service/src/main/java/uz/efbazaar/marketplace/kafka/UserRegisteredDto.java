package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record UserRegisteredDto(
        UUID userId,
        Long telegramId,
        String telegramUsername,
        String displayName,
        String currentPhotoFileUniqueId,
        Instant occurredAt) {}
