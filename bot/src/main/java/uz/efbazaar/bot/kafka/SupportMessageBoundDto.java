package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

public record SupportMessageBoundDto(
        UUID chatId,
        UUID messageId,
        Long telegramMessageId,
        Instant occurredAt
) {}
