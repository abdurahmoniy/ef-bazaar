package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeDeadlineExtender;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static uz.efbazaar.trade.trade.service.TradeDeadlineExtender.ExtensionOutcome.CAPPED;
import static uz.efbazaar.trade.trade.service.TradeDeadlineExtender.ExtensionOutcome.EXTENDED;
import static uz.efbazaar.trade.trade.service.TradeDeadlineExtender.ExtensionOutcome.TRADE_NOT_SMART;

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
                repo.findById(t.id()).orElseThrow().getState() == TradeState.WAITING_EMAIL_CHANGE);

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

    /**
     * IN_PROGRESS must carry {@code state_deadline = NULL}: it has no TIMEOUT
     * transition, so TradeTimeoutScheduler would throw
     * InvalidTradeTransitionException on such a row every 10 seconds forever,
     * with nothing able to clear it. The extender previously guarded only
     * {@code isTerminal()}, which left that invariant resting entirely on the
     * Python worker never emitting {@code worker-queued} for a human trade — an
     * invariant enforced in a different repository than the code owning the
     * column.
     */
    @Test
    void aHumanTradeInProgressNeverGetsAStateDeadline() {
        UUID id = UUID.randomUUID();
        repo.save(Trade.builder()
                .id(id)
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.IN_PROGRESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(UUID.randomUUID())
                .adminFeeUzs(20_000L)
                .adminAcceptedAt(Instant.now())
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());

        assertThat(extender.extend(id, 60)).isEqualTo(TRADE_NOT_SMART);

        assertThat(repo.findById(id).orElseThrow().getStateDeadline())
                .as("a deadline here would make TradeTimeoutScheduler throw on this row forever")
                .isNull();
    }
}
