package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeActionNotificationDto(
        UUID tradeId,
        UUID chatId,
        UUID recipientUserId,
        String actionType,
        long amountUzs,
        String details,
        Instant occurredAt) {}
