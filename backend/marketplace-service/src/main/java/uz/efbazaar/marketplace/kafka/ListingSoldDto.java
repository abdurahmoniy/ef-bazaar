package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Kafka mirror of trade-service's {@code uz.efbazaar.trade.kafka.TradeEvents.ListingSold}.
 * Emitted on trade SUCCESS so the marketplace can demote the listing to the
 * end of browse results and stamp it with a "Sotildi" badge.
 */
public record ListingSoldDto(
        UUID listingId,
        UUID buyerId,
        UUID sellerId,
        long priceUzs,
        Instant soldAt) {}
