package uz.efbazaar.trade.payment;

import java.util.UUID;

public record PaymentIntent(
        String intentId,
        UUID tradeId,
        long amountUzsTiyin,
        String checkoutUrl,
        PaymentStatus status
) {
}
