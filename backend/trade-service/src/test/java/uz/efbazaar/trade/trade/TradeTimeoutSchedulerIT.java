package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeTimeoutScheduler;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@SpringBootTest
class TradeTimeoutSchedulerIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeRepository repo;
    @Autowired TradeTimeoutScheduler scheduler;

    /**
     * With application-test.yml's waiting-payment-seconds=2, a trade parked
     * in WAITING_PAYMENT should ORPHAN within a few seconds of its deadline.
     */
    @Test
    void waitingPaymentOrphansAfterDeadline() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        // Savdoni INITIATED dan chiqaramiz. MockWorker ham xuddi shu ishni
        // qiladi, shuning uchun poygaga tushmaydigan yordamchi ishlatiladi.
        leaveInitiated(trades, t.id());

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            scheduler.sweep(); // don't wait for the fixedRate — call directly
            var reloaded = repo.findById(t.id()).orElseThrow();
            assertThat(reloaded.getState()).isEqualTo(TradeState.ORPHANED);
        });
    }
}
