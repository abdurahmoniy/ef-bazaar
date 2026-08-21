package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeProposalService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Proves the wallet is actually in the trade's path.
 *
 * <p>The escrow client is a stub here, not a real payment-service — what is
 * under test is that trade-service asks it at the right moments and reacts to
 * the answer. The money movement itself is payment-service's own IT.
 */
@SpringBootTest
@Import(StubEscrowConfig.class)
class TradeEscrowWiringIT extends AbstractIntegrationIT {

    @Autowired TradeProposalService proposals;
    @Autowired TradeRepository trades;
    @Autowired EscrowClient escrow;

    @BeforeEach
    void resetStub() {
        // Not Mockito.reset: this mock is shared and other threads are calling
        // it. Recorded invocations still have to go, or a verify() here counts
        // a call another test made.
        Mockito.clearInvocations(escrow);
        StubEscrowConfig.clear();
    }

    private ProposalResponse propose(UUID seller, UUID buyer, long amountUzs) {
        return proposals.create(seller, new ProposalCreateRequest(
                UUID.randomUUID(), buyer, seller, buyer, amountUzs,
                UUID.randomUUID(), null, TradeMode.SMART, null, null, null));
    }

    @Test
    void acceptingHoldsThePriceInTheBuyersWallet() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var pr = propose(seller, buyer, 500_000L);

        var trade = proposals.accept(buyer, pr.proposalId(), UUID.randomUUID());

        verify(escrow).hold(eq(trade.id()), eq(buyer), any(), eq(500_000L), anyLong());
    }

    @Test
    void aBuyerWhoCannotAffordItGetsNoTradeAtAll() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        // Armed through the stub rather than by re-stubbing the mock: the
        // trade id does not exist yet, so this has to apply to any hold.
        StubEscrowConfig.failNext("hold", null,
                () -> new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                        "Hamyonda mablag' yetarli emas"));
        var pr = propose(seller, buyer, 500_000L);
        long before = trades.count();

        assertThatThrownBy(() -> proposals.accept(buyer, pr.proposalId(), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409")
                .hasMessageContaining("yetarli emas");

        // "Nothing was created" rather than "the table is empty": these ITs
        // share one database and other classes leave rows behind, so an
        // absolute count would pass alone and fail in a full run.
        //
        // The whole point of holding first: a trade that cannot be funded is
        // never created, so no placeholder mailbox is burned on it either.
        assertThat(trades.count()).isEqualTo(before);
    }

    // The "openTrade failed after the hold, so release it" path is deliberately
    // untested here. Every way openTrade can refuse a SMART trade is already
    // checked before the hold runs — by create() or by accept() — so the branch
    // is unreachable from this layer without mocking TradeService itself. It
    // exists for the failures that are not validation: a database that goes
    // away between the hold and the insert. Writing a test that fakes that
    // would assert the mock, not the behaviour.

}
