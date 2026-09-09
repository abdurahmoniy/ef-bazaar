package uz.efbazaar.bot.kafka;

import java.time.Instant;

public record SupportReplyReceivedDto(
        Long replyToTelegramMessageId,
        Long telegramMessageId,
        String adminName,
        String adminUsername,
        String text,
        Instant occurredAt
) {}
