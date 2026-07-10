package uz.efbazaar.trade.payment;

import java.util.UUID;

public record PayoutIntent(
        String payoutIntentId,
        UUID tradeId,
        long amountUzsTiyin,
        PayoutStatus status
) {
}
