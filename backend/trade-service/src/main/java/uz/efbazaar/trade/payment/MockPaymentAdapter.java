package uz.efbazaar.trade.payment;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MVP payment stub. Held in memory — restarts wipe state. That's acceptable
 * because Plan B stores the intent id on the Trade row; a restart mid-trade
 * during MVP just means B must re-click "TO'LOV QILDIM".
 *
 * Active in the "local", "docker", and "test" profiles. The Uzum adapter, when
 * built, will be @Profile("!mock") and take over automatically.
 */
@Component
@Profile({"local", "docker", "test"})
public class MockPaymentAdapter implements PaymentAdapter {

    private final Map<String, PaymentIntent> payments = new ConcurrentHashMap<>();
    private final Map<String, PayoutIntent> payouts = new ConcurrentHashMap<>();

    @Override
    public PaymentIntent createCheckoutIntent(UUID tradeId, long amountUzsTiyin) {
        String id = "mock-pay-" + UUID.randomUUID();
        PaymentIntent intent = new PaymentIntent(
                id, tradeId, amountUzsTiyin, "https://mock/checkout/" + id, PaymentStatus.PENDING);
        payments.put(id, intent);
        return intent;
    }

    @Override
    public PaymentStatus markPaid(String intentId) {
        PaymentIntent existing = payments.get(intentId);
        if (existing == null) {
            throw new IllegalArgumentException("Unknown payment intent " + intentId);
        }
        PaymentIntent updated = new PaymentIntent(
                existing.intentId(), existing.tradeId(), existing.amountUzsTiyin(),
                existing.checkoutUrl(), PaymentStatus.PAID);
        payments.put(intentId, updated);
        return PaymentStatus.PAID;
    }

    @Override
    public PaymentStatus checkPaymentStatus(String intentId) {
        PaymentIntent existing = payments.get(intentId);
        return existing == null ? PaymentStatus.FAILED : existing.status();
    }

    @Override
    public PayoutIntent createPayoutIntent(UUID tradeId, String recipientCardPan, long amountUzsTiyin) {
        String id = "mock-payout-" + UUID.randomUUID();
        PayoutIntent intent = new PayoutIntent(id, tradeId, amountUzsTiyin, PayoutStatus.PENDING);
        payouts.put(id, intent);
        return intent;
    }

    @Override
    public PayoutStatus confirmPayout(String payoutIntentId) {
        PayoutIntent existing = payouts.get(payoutIntentId);
        if (existing == null) {
            throw new IllegalArgumentException("Unknown payout intent " + payoutIntentId);
        }
        PayoutIntent updated = new PayoutIntent(
                existing.payoutIntentId(), existing.tradeId(), existing.amountUzsTiyin(),
                PayoutStatus.CONFIRMED);
        payouts.put(payoutIntentId, updated);
        return PayoutStatus.CONFIRMED;
    }

    @Override
    public PayoutStatus checkPayoutStatus(String payoutIntentId) {
        PayoutIntent existing = payouts.get(payoutIntentId);
        return existing == null ? PayoutStatus.FAILED : existing.status();
    }
}
