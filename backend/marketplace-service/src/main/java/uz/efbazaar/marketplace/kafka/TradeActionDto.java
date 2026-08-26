package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeActionDto(
        UUID tradeId,
        UUID chatId,
        UUID recipientUserId,
        String actionType,
        long amountUzs,
        String details,
        Instant occurredAt) {}
