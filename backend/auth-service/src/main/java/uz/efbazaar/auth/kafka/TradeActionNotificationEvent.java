package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeActionNotificationEvent(
        UUID tradeId,
        UUID chatId,
        UUID recipientUserId,
        Long recipientTelegramId,
        String recipientDisplayName,
        String actionType,
        long amountUzs,
        String details,
        Instant occurredAt) {}
