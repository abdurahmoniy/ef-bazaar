package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeDeadlineExtender;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static uz.efbazaar.trade.trade.service.TradeDeadlineExtender.ExtensionOutcome.CAPPED;
import static uz.efbazaar.trade.trade.service.TradeDeadlineExtender.ExtensionOutcome.EXTENDED;

@SpringBootTest
class TradeDeadlineExtenderIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeRepository repo;
    @Autowired TradeDeadlineExtender extender;
    @Autowired StringRedisTemplate redis;

    private UUID openTradeWithDeadline() {
        TradeResponse t = trades.openTrade(
                UUID.randomUUID(), UUID.randomUUID(), 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        // MockWorker answers the email-provision-request over real Kafka and
        // drives INITIATED -> WAITING_PAYMENT asynchronously, which resets
        // stateDeadline as a side effect (TradeStateHandler#onEnter). Wait for
        // that churn to settle before overriding the deadline ourselves, or a
        // late-arriving transition clobbers our override underneath the test.
        await().atMost(10, TimeUnit.SECONDS).until(() ->
                repo.findById(t.id()).orElseThrow().getState() == TradeState.WAITING_PAYMENT);

        var trade = repo.findById(t.id()).orElseThrow();
        trade.setStateDeadline(Instant.now().plusSeconds(600));
        return repo.save(trade).getId();
    }

    @BeforeEach
    void clearCounters() {
        for (String key : redis.keys("trade:*:deadline-extensions")) {
            redis.delete(key);
        }
    }

    @Test
    void firstExtensionMovesDeadlineForward() {
        UUID tid = openTradeWithDeadline();
        Instant before = repo.findById(tid).orElseThrow().getStateDeadline();

        assertThat(extender.extend(tid, 60)).isEqualTo(EXTENDED);

        Instant after = repo.findById(tid).orElseThrow().getStateDeadline();
        assertThat(after).isAfter(before);
    }

    @Test
    void thirdExtensionIsCapped() {
        UUID tid = openTradeWithDeadline();
        assertThat(extender.extend(tid, 60)).isEqualTo(EXTENDED);
        assertThat(extender.extend(tid, 60)).isEqualTo(EXTENDED);
        assertThat(extender.extend(tid, 60)).isEqualTo(CAPPED);
    }
}
