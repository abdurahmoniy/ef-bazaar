package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Konami code must not drag the trade backwards.
 *
 * <p>The code arrives from the worker while the seller may be pressing "email
 * changed" in the same second. The consumer used to load the Trade, set two
 * fields and save the whole row — so a copy read before the click, written
 * after it, put the state back to what it had been. The seller's click simply
 * vanished, and the trade sat in WAITING_EMAIL_CHANGE with nothing to show why.
 *
 * <p>Found through CI: the swap work added a query inside {@code onEnter},
 * which shifted when the worker's reply landed and widened a window that had
 * been there all along.
 */
@SpringBootTest
@Import(StubEscrowConfig.class)
class EmailChangeCodeDoesNotRevertStateIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeRepository tradeRepo;
    @Autowired org.springframework.transaction.support.TransactionTemplate tx;

    @Test
    void recordingTheCodeLeavesEveryOtherColumnAlone() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID tradeId = trades.openTrade(seller, buyer, 500_000L, null, null, null).id();

        leaveInitiated(trades, tradeId);
        trades.transition(tradeId, TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);

        // A copy of the trade as the worker's handler would have read it,
        // before the seller acted.
        Trade stale = tradeRepo.findById(tradeId).orElseThrow();
        assertThat(stale.getState()).isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        trades.transition(tradeId, TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);

        // The code lands afterwards, written the way the consumer writes it.
        // In its own transaction, as the Kafka listener's would be.
        tx.executeWithoutResult(status ->
                tradeRepo.recordEmailChangeCode(tradeId, "123456", Instant.now()));

        Trade after = tradeRepo.findById(tradeId).orElseThrow();
        assertThat(after.getState())
                .as("a targeted update cannot undo the seller's step")
                .isEqualTo(TradeState.VERIFYING_KONAMI_LINK);
        assertThat(after.getEmailChangeVerificationCode()).isEqualTo("123456");
    }

    /**
     * The failure the targeted update exists to prevent, made explicit.
     *
     * <p>Saving a whole Trade that was loaded before someone else moved it puts
     * the state back. This is what the consumer used to do, and it is why the
     * seller's click could vanish.
     */
    @Test
    void savingAStaleCopyWouldPutTheStateBack() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID tradeId = trades.openTrade(seller, buyer, 500_000L, null, null, null).id();

        leaveInitiated(trades, tradeId);
        trades.transition(tradeId, TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);
        Trade stale = tradeRepo.findById(tradeId).orElseThrow();

        trades.transition(tradeId, TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);

        stale.setEmailChangeVerificationCode("123456");
        tradeRepo.save(stale);

        assertThat(tradeRepo.findById(tradeId).orElseThrow().getState())
                .as("read-mutate-save reverts the state — hence recordEmailChangeCode")
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);
    }

}
