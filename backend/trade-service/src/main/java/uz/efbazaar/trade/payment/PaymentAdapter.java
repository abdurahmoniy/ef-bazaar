package uz.efbazaar.trade.payment;

import java.util.UUID;

/**
 * Provider-agnostic contract. MVP uses MockPaymentAdapter; UzumPaymentAdapter
 * (Uzum Checkout + PaymentHub) lands post-MVP.
 */
public interface PaymentAdapter {

    /** Called on entry into STATE_2 (WAITING_PAYMENT). */
    PaymentIntent createCheckoutIntent(UUID tradeId, long amountUzsTiyin);

    /** Flip the intent to PAID. Only supported by the mock adapter. */
    PaymentStatus markPaid(String intentId);

    PaymentStatus checkPaymentStatus(String intentId);

    /** Called on entry into STATE_8_SUCCESS. */
    PayoutIntent createPayoutIntent(UUID tradeId, String recipientCardPan, long amountUzsTiyin);

    PayoutStatus confirmPayout(String payoutIntentId);

    PayoutStatus checkPayoutStatus(String payoutIntentId);
}
