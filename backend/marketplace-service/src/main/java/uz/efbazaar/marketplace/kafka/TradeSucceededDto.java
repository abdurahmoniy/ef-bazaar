package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeSucceededDto(
        UUID tradeId,
        UUID buyerId,
        UUID sellerId,
        String mode,
        Instant occurredAt) {}
