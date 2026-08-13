package uz.efbazaar.payment.card.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.payment.card.domain.CardBrand;
import uz.efbazaar.payment.card.domain.PlatformCard;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlatformCardResponse(
        UUID id,
        /** Never the full number in a list view — the admin panel shows a mask. */
        String maskedPan,
        String last4,
        String holderName,
        short expiryMonth,
        short expiryYear,
        CardBrand brand,
        int displayOrder,
        boolean active,
        Long balanceTiyin,
        Instant balanceObservedAt
) {
    public static PlatformCardResponse of(PlatformCard c) {
        return new PlatformCardResponse(
                c.getId(),
                "**** **** **** " + c.getLast4(),
                c.getLast4(),
                c.getHolderName(),
                c.getExpiryMonth(),
                c.getExpiryYear(),
                c.getBrand(),
                c.getDisplayOrder(),
                c.isActive(),
                c.getBalanceTiyin(),
                c.getBalanceObservedAt());
    }
}
