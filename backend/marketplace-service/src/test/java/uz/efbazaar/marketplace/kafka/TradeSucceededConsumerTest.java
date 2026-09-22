package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.referral.ReferralService;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.inOrder;

/**
 * Savdo yakunlandi: mukofot, akkount ko'chishi va kutayotgan pochta.
 *
 * <p>Oxirgisi shu yerda bo'lishi SHART. Pochta topshirilgani boshqa topikda
 * keladi va bir vaqtda ishlansa, u akkountni ko'rmay manzilni kutishga qo'yib
 * ketishi mumkin. Akkount ochilib commit bo'lgach yana bir marta qaralmasa,
 * o'sha manzilni endi hech kim olmaydi.
 */
@ExtendWith(MockitoExtension.class)
class TradeSucceededConsumerTest {

    @Mock ReferralService referrals;
    @Mock uz.efbazaar.marketplace.account.ListingAccountLink accounts;
    @InjectMocks TradeSucceededConsumer consumer;

    @Test
    void anAccountOpenedHereCollectsAnAddressThatWasAlreadyWaiting() {
        UUID trade = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID seller = UUID.randomUUID();

        consumer.onTradeSucceeded(new TradeSucceededDto(
                trade, buyer, seller, UUID.randomUUID(), "SMART", Instant.now()));

        var order = inOrder(accounts);
        order.verify(accounts).onTradeSucceeded(eqTrade(trade), org.mockito.ArgumentMatchers.any(),
                eqTrade(buyer), eqTrade(seller));
        // Xaridor ham, sotuvchi ham: obmenda ikkala taraf akkount oladi.
        order.verify(accounts).drainPendingEmail(trade, buyer);
        order.verify(accounts).drainPendingEmail(trade, seller);
    }

    private static UUID eqTrade(UUID value) {
        return org.mockito.ArgumentMatchers.eq(value);
    }
}
