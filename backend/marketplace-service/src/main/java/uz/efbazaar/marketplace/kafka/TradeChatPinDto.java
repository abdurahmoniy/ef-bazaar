package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirror of trade-service's trade-opened / trade-closed payload. */
public record TradeChatPinDto(UUID tradeId, UUID chatId, Instant occurredAt) {}
