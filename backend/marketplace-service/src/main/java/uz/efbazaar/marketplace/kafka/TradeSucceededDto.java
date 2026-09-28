package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

public record TradeSucceededDto(
        UUID tradeId,
        UUID buyerId,
        UUID sellerId,
        /** Eski hodisalarda yo'q — null bo'lsa akkount ko'chirilmaydi. */
        UUID listingId,
        String mode,
        /** SALE, SWAP, or SWAP_SURCHARGE; absent in older events. */
        String kind,
        /** Obmenda xaridor bergan akkount; eski hodisalarda yo'q. */
        UUID giveAccountId,
        Instant occurredAt) {}
