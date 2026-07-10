package uz.efbazaar.trade.card.dto;

import uz.efbazaar.trade.card.domain.CardBrand;

import java.time.Instant;
import java.util.UUID;

public record CardResponse(
        UUID id,
        String last4,
        short expiryMonth,
        short expiryYear,
        CardBrand brand,
        boolean savedToProfile,
        Instant createdAt
) {
}
