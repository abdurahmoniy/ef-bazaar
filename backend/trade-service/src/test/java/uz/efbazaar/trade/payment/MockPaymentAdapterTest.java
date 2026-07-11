package uz.efbazaar.trade.payment;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MockPaymentAdapterTest {

    private MockPaymentAdapter mock;

    @BeforeEach
    void setUp() {
        mock = new MockPaymentAdapter();
    }

    @Test
    void checkoutIntentStartsPending() {
        PaymentIntent intent = mock.createCheckoutIntent(UUID.randomUUID(), 500_000_00L);
        assertThat(intent.status()).isEqualTo(PaymentStatus.PENDING);
        assertThat(mock.checkPaymentStatus(intent.intentId())).isEqualTo(PaymentStatus.PENDING);
    }

    @Test
    void markPaidFlipsToPaid() {
        PaymentIntent intent = mock.createCheckoutIntent(UUID.randomUUID(), 100_00L);
        PaymentStatus s = mock.markPaid(intent.intentId());
        assertThat(s).isEqualTo(PaymentStatus.PAID);
        assertThat(mock.checkPaymentStatus(intent.intentId())).isEqualTo(PaymentStatus.PAID);
    }

    @Test
    void markPaidUnknownIntentThrows() {
        assertThatThrownBy(() -> mock.markPaid("nope"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void payoutFlow() {
        PayoutIntent p = mock.createPayoutIntent(UUID.randomUUID(), "4111111111111111", 500_000_00L);
        assertThat(p.status()).isEqualTo(PayoutStatus.PENDING);

        PayoutStatus confirmed = mock.confirmPayout(p.payoutIntentId());
        assertThat(confirmed).isEqualTo(PayoutStatus.CONFIRMED);
        assertThat(mock.checkPayoutStatus(p.payoutIntentId())).isEqualTo(PayoutStatus.CONFIRMED);
    }
}
