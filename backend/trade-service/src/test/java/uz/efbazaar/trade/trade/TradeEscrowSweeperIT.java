package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeEscrowSweeper;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The safety net under {@code releaseEscrow}, which swallows its own failure.
 * That trade-off is only defensible if something comes back for the money.
 */
@SpringBootTest
@Import(StubEscrowConfig.class)
class TradeEscrowSweeperIT extends AbstractIntegrationIT {

    @Autowired TradeEscrowSweeper sweeper;
    @Autowired TradeRepository trades;
    @Autowired EscrowClient escrow;

    @BeforeEach
    void resetStub() {
        Mockito.reset(escrow);
        StubEscrowConfig.calls.clear();
    }

    private Trade stranded(TradeState state, TradeMode mode) {
        return trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(500_000L)
                .state(state)
                .mode(mode)
                .mailboxId(UUID.randomUUID())
                // chk_trades_smart_cards: a SMART trade must carry both cards.
                .sellerCardId(mode == TradeMode.SMART ? UUID.randomUUID() : null)
                .buyerCardId(mode == TradeMode.SMART ? UUID.randomUUID() : null)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build());
    }

    @Test
    void aRejectedTradeWhoseRefundFailedIsRefundedLater() {
        Trade t = stranded(TradeState.REJECTED, TradeMode.SMART);

        sweeper.sweep();

        verify(escrow).release(eq(t.getId()), eq(t.getBuyerId()), any(), eq(500_000L), anyLong());
        assertThat(trades.findById(t.getId()).orElseThrow().getEscrowResolvedAt())
                .as("resolved, so the next sweep leaves it alone")
                .isNotNull();
    }

    @Test
    void aSuccessfulTradeThatNeverSettledIsSettledLater() {
        Trade t = stranded(TradeState.SUCCESS, TradeMode.SMART);

        sweeper.sweep();

        verify(escrow).settle(eq(t.getId()), any(), any(), eq(500_000L), anyLong());
        assertThat(trades.findById(t.getId()).orElseThrow().getEscrowResolvedAt()).isNotNull();
    }

    @Test
    void aTradeStillRunningIsLeftAlone() {
        Trade t = stranded(TradeState.WAITING_PAYMENT, TradeMode.SMART);

        sweeper.sweep();

        // A live trade is SUPPOSED to be holding money. Sweeping it would
        // refund a buyer mid-trade and hand the seller nothing.
        verify(escrow, never()).release(eq(t.getId()), any(), any(), anyLong(), anyLong());
        assertThat(trades.findById(t.getId()).orElseThrow().getEscrowResolvedAt()).isNull();
    }

    @Test
    void aHumanTradeIsNotSweptBecauseItNeverHeldAnything() {
        Trade t = stranded(TradeState.REJECTED, TradeMode.HUMAN);

        sweeper.sweep();

        verify(escrow, never()).release(eq(t.getId()), any(), any(), anyLong(), anyLong());
    }

    @Test
    void aWalletStillDownLeavesTheTradeForTheNextSweep() {
        Trade t = stranded(TradeState.REJECTED, TradeMode.SMART);
        doThrow(new IllegalStateException("wallet down"))
                .when(escrow).release(eq(t.getId()), any(), any(), anyLong(), anyLong());

        sweeper.sweep();   // must not throw — one stuck trade cannot stop the rest

        assertThat(trades.findById(t.getId()).orElseThrow().getEscrowResolvedAt())
                .as("still owed, so it stays in the sweeper's sights")
                .isNull();
    }

    @Test
    void anExpiredTradeIsRefundedToo() {
        // Found in production: a trade ran out of time, went ORPHANED, and the
        // buyer's money stayed frozen. Escrow was wired into SUCCESS and
        // REJECTED only — ORPHANED is terminal as well, and nothing was left
        // that could ever free it.
        Trade t = stranded(TradeState.ORPHANED, TradeMode.SMART);

        sweeper.sweep();

        verify(escrow).release(eq(t.getId()), eq(t.getBuyerId()), any(), eq(500_000L), anyLong());
        assertThat(trades.findById(t.getId()).orElseThrow().getEscrowResolvedAt()).isNotNull();
    }

    @Test
    void everyTerminalStateResolvesItsEscrow() {
        // The gap was one missing enum constant, so assert over the whole set
        // rather than the two that happened to be remembered.
        for (TradeState terminal : TradeState.values()) {
            if (!terminal.isTerminal()) continue;
            Mockito.reset(escrow);
            Trade t = stranded(terminal, TradeMode.SMART);

            sweeper.sweep();

            assertThat(trades.findById(t.getId()).orElseThrow().getEscrowResolvedAt())
                    .as("%s must not leave money frozen", terminal)
                    .isNotNull();
        }
    }
}
