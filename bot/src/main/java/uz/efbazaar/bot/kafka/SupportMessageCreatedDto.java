package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

public record SupportMessageCreatedDto(
        UUID chatId,
        UUID messageId,
        String category,
        UUID userId,
        String senderName,
        String senderContact,
        String content,
        Long replyToTelegramMessageId,
        Instant occurredAt
) {}
