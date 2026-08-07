package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirror of trade-service's {@code efbazaar.trade.admin-invited} payload. */
public record TradeAdminInvitedDto(
        UUID tradeId,
        UUID adminId,
        UUID sellerId,
        UUID buyerId,
        long priceUzs,
        Long feeUzs,
        Instant occurredAt) {}
