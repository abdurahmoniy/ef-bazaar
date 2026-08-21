package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Transitions on one trade have to take turns.
 *
 * <p>{@code TradeService.transition} reads the trade, computes the next state
 * and saves the whole row. Run two at once and each computes from its own
 * snapshot, so the slower writer commits a state the faster one has already
 * moved past. A swap makes that routine rather than exotic: the worker sends a
 * provisioned report per mailbox, both land on listener threads at the same
 * moment, and the second one enables a PAYMENT_CONFIRMED that races the first.
 * Seen in CI as a paid-for trade dropping back to waiting for payment, after
 * which the parties' next click came back as an illegal event.
 *
 * <p>Staged rather than raced. Left to chance the losing interleaving turned
 * up about once in twelve tries, which is no guard at all; here one writer is
 * held open on purpose, so the other either reads what is current or does not.
 */
@SpringBootTest
@Import(StubEscrowConfig.class)
class ConcurrentTransitionIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeRepository tradeRepo;
    @Autowired TransactionTemplate tx;

    @Test
    void aTransitionActsOnTheStateTheLastWriterLeftBehind() throws Exception {
        Trade t = openSwap();
        CountDownLatch writing = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<RuntimeException> refusal = new AtomicReference<>();

        // Another writer has moved the trade on but not yet committed — the
        // ordinary shape of two listener threads on one swap.
        Thread holder = Thread.ofPlatform().start(() -> tx.executeWithoutResult(status -> {
            Trade held = tradeRepo.findByIdForUpdate(t.getId()).orElseThrow();
            held.setState(TradeState.WAITING_PAYMENT);
            tradeRepo.saveAndFlush(held);
            writing.countDown();
            awaitQuietly(commit);
        }));
        assertThat(writing.await(10, TimeUnit.SECONDS)).as("the other writer started").isTrue();

        Thread mover = Thread.ofPlatform().start(() -> {
            try {
                trades.transition(t.getId(), TradeEvent.PAYMENT_CONFIRMED,
                        ActorType.SYSTEM, null);
            } catch (RuntimeException e) {
                refusal.set(e);
            } finally {
                finished.countDown();
            }
        });

        // Give it every chance to read too early, then let the other writer go.
        Thread.sleep(500);
        commit.countDown();
        assertThat(finished.await(20, TimeUnit.SECONDS)).as("the transition returned").isTrue();

        assertThat(refusal.get())
                .as("read before the other writer committed, this saw the state two "
                        + "steps back and called a legal event illegal")
                .isNull();
        assertThat(tradeRepo.findById(t.getId()).orElseThrow().getState())
                .as("payment was confirmed against the state that was actually current")
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        holder.join(10_000);
        mover.join(10_000);
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(20, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private Trade openSwap() {
        var response = trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                0L, null, null, UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SWAP, 500_000L);
        return tradeRepo.findById(response.id()).orElseThrow();
    }
}
