package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeActionNotificationDto(
        UUID tradeId,
        UUID chatId,
        UUID recipientUserId,
        Long recipientTelegramId,
        String recipientDisplayName,
        String actionType,
        long amountUzs,
        String details,
        Instant occurredAt) {}
