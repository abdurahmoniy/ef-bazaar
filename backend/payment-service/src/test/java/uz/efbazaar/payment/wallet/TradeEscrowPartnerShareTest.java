package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;
import uz.efbazaar.payment.wallet.service.TradeCommissionService;
import uz.efbazaar.payment.wallet.service.TradeEscrowService;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The advertising partner's cut of a settled trade.
 *
 * <p>A unit test rather than an IT because what is being pinned is arithmetic
 * and the exact set of postings, not a database guarantee — {@link
 * TradeEscrowServiceIT} already covers the latter.
 */
class TradeEscrowPartnerShareTest {

    private LedgerService ledger;
    private TradeCommissionService commissionService;
    private TradeEscrowService escrow;

    private final UUID tradeId = UUID.randomUUID();
    private final UUID buyer = UUID.randomUUID();
    private final UUID seller = UUID.randomUUID();
    private final UUID partner = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ledger = mock(LedgerService.class);
        commissionService = mock(TradeCommissionService.class);
        var terms = mock(uz.efbazaar.payment.wallet.repository.TradeEscrowTermsRepository.class);
        when(terms.findForUpdate(tradeId)).thenReturn(java.util.Optional.of(
                new uz.efbazaar.payment.wallet.repository.TradeEscrowTermsRepository.Terms(100_000L, 1_000_000L, 0, 900_000L, null)));
        escrow = new TradeEscrowService(ledger, commissionService, terms);
        // settle and release both no-op on a trade that was never held.
        when(ledger.hasPosted(anyString())).thenReturn(true);
    }

    @Test
    @DisplayName("the partner's share comes out of the commission, not on top of it")
    void shareComesOutOfCommission() {
        when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

        escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L, partner, 1000);  // 10%

        // The settlement itself is untouched: the whole fee still goes to
        // PLATFORM_REVENUE, and what the seller receives does not move. The
        // share is cut from the platform's part, not from theirs.
        var settlement = postingsFor(TransactionKind.TRADE_SETTLE);
        assertThat(settlement.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(settlement)
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100_000L))
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, seller, -900_000L))
                .noneMatch(p -> partner.equals(p.userId()));

        // The share is its OWN transaction, because a ledger transaction
        // carries one kind and the kind is what the partner's wallet history
        // shows them. Folded into the settlement it would read as "trade
        // settled" for a trade they were not part of.
        var share = postingsFor(TransactionKind.PARTNER_TRADE_SHARE);
        assertThat(share.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(share)
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, 10_000L))
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, partner, -10_000L));
    }

    @Test
    @DisplayName("a trade with no partner posts exactly what it posted before")
    void noPartnerIsUnchanged() {
        when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

        escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L, null, 0);

        assertThat(capturePostings())
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100_000L))
                .noneMatch(p -> p.account() == LedgerAccount.USER_AVAILABLE && partner.equals(p.userId()));
    }

    @Test
    @DisplayName("the five-argument settle still pays no partner")
    void legacyOverloadIsUnchanged() {
        // Existing callers pass no partner at all; they must keep behaving
        // exactly as they did before advertising existed.
        when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

        escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L);

        assertThat(capturePostings())
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100_000L))
                .noneMatch(p -> partner.equals(p.userId()));
    }

    @Test
    @DisplayName("a zero rate pays the partner nothing rather than a zero posting")
    void zeroRatePostsNothing() {
        // chk_entry_non_zero rejects a zero entry — and a FIXED-mode partner
        // takes exactly this path on every trade.
        when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

        escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L, partner, 0);

        assertThat(capturePostings())
                .noneMatch(p -> p.account() == LedgerAccount.USER_AVAILABLE && partner.equals(p.userId()));
    }

    @Test
    @DisplayName("a whole-commission share leaves out the platform's zero posting")
    void fullShareGivesTheWholeFeeBack() {
        when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

        escrow.settle(tradeId, buyer, seller, 1_000_000L, 1_000_000L, partner, 10_000);

        // 100% is inside the range the schema allows. In the old single
        // transaction shape it produced a zero PLATFORM_REVENUE posting, which
        // LedgerService rejects outright; split in two, the platform simply
        // takes the fee and hands all of it back.
        assertThat(postingsFor(TransactionKind.TRADE_SETTLE))
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -100_000L));
        assertThat(postingsFor(TransactionKind.PARTNER_TRADE_SHARE))
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, 100_000L))
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, partner, -100_000L));
    }

    @Test
    @DisplayName("release pays no partner")
    void releasePaysNoPartner() {
        when(commissionService.feeTiyin(1_000_000L)).thenReturn(100_000L);

        escrow.release(tradeId, buyer, seller, 1_000_000L, 1_000_000L);

        assertThat(capturePostings())
                .noneMatch(p -> partner.equals(p.userId()));
    }

    /** Bitta turdagi tranzaksiyaning yozuvlari — endi settle ikkitasini yozadi. */
    private List<Posting> postingsFor(TransactionKind kind) {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Posting>> captor =
                (ArgumentCaptor<List<Posting>>) (ArgumentCaptor<?>) ArgumentCaptor.forClass(List.class);
        org.mockito.Mockito.verify(ledger).post(eq(kind), anyString(), any(), any(), captor.capture());
        return captor.getValue();
    }

    private List<Posting> capturePostings() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Posting>> captor =
                (ArgumentCaptor<List<Posting>>) (ArgumentCaptor<?>) ArgumentCaptor.forClass(List.class);
        org.mockito.Mockito.verify(ledger).post(any(), anyString(), any(), any(), captor.capture());
        return captor.getValue();
    }
}
