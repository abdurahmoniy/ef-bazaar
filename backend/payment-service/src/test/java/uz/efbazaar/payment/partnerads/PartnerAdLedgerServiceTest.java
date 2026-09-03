package uz.efbazaar.payment.partnerads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.domain.WalletAccount;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The advertising ledger entries.
 *
 * <p>Every case asserts the postings sum to zero. An unbalanced transaction is
 * rejected by {@link LedgerService} in production, but here the ledger is a
 * mock — so without this assertion a broken sign would pass the unit test and
 * only surface as a 400 in front of a paying seller.
 */
class PartnerAdLedgerServiceTest {

    private LedgerService ledger;
    private PartnerAdLedgerService service;

    private final UUID orderId = UUID.randomUUID();
    private final UUID postId = UUID.randomUUID();
    private final UUID seller = UUID.randomUUID();
    private final UUID partner = UUID.randomUUID();
    private final UUID channelId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ledger = mock(LedgerService.class);
        service = new PartnerAdLedgerService(ledger);
        // Rich enough for every case that is not about running out.
        when(ledger.balanceOf(any())).thenReturn(walletWith(100_000_000L));
    }

    @Test
    @DisplayName("the hold covers the whole order in one transaction")
    void holdIsWholeOrder() {
        service.hold(orderId, seller, 1_500_000L);

        var postings = capturePostings();
        assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(postings)
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, seller, 1_500_000L))
                .contains(new Posting(LedgerAccount.USER_HELD, seller, -1_500_000L));
        verify(ledger).post(eq(TransactionKind.PARTNER_POST_HOLD),
                eq("partner-post-hold:" + orderId), any(), anyString(), any());
    }

    @Test
    @DisplayName("settling moves one post's price from the hold to the partner")
    void settleMovesOnePost() {
        service.settle(postId, seller, partner, 500_000L);

        var postings = capturePostings();
        assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(postings)
                .contains(new Posting(LedgerAccount.USER_HELD, seller, 500_000L))
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, partner, -500_000L));
        verify(ledger).post(eq(TransactionKind.PARTNER_POST_SETTLE),
                eq("partner-post:" + postId), any(), anyString(), any());
    }

    @Test
    @DisplayName("refunding returns one post's price to the seller")
    void refundReturnsToSeller() {
        service.refund(postId, seller, 500_000L);

        var postings = capturePostings();
        assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(postings)
                .contains(new Posting(LedgerAccount.USER_HELD, seller, 500_000L))
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, seller, -500_000L));
        verify(ledger).post(eq(TransactionKind.PARTNER_POST_REFUND),
                eq("partner-post-refund:" + postId), any(), anyString(), any());
    }

    @Test
    @DisplayName("the hold is keyed on the order, so a second order for the same listing still charges")
    void holdKeyIsTheOrderNotTheListing() {
        // Were the key the listing, a seller who added another channel later
        // would look like a redelivery to LedgerService and be charged nothing.
        service.hold(orderId, seller, 500_000L);
        UUID secondOrder = UUID.randomUUID();
        service.hold(secondOrder, seller, 500_000L);

        verify(ledger).post(any(), eq("partner-post-hold:" + orderId), any(), anyString(), any());
        verify(ledger).post(any(), eq("partner-post-hold:" + secondOrder), any(), anyString(), any());
    }

    @Test
    @DisplayName("a zero amount posts nothing rather than a zero entry")
    void zeroPostsNothing() {
        service.hold(orderId, seller, 0L);
        service.settle(postId, seller, partner, 0L);
        service.refund(postId, seller, 0L);
        service.monthly(channelId, partner, 0L, "2026-09");

        verify(ledger, never()).post(any(), anyString(), any(), anyString(), any());
    }

    @Test
    @DisplayName("insufficient funds names the shortfall the way the frontend recognises")
    void insufficientFunds() {
        // The frontend matches this exact wording with `isInsufficientFunds`
        // and builds the wallet top-up link out of it, so the shape is part of
        // the contract, not just a message.
        when(ledger.balanceOf(seller)).thenReturn(walletWith(300_000L));

        assertThatThrownBy(() -> service.hold(orderId, seller, 500_000L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Hamyonda mablag' yetarli emas")
                .hasMessageContaining("2000");
    }

    @Test
    @DisplayName("the monthly payout comes out of platform revenue, keyed on channel and month")
    void monthlyIsPaidFromRevenue() {
        service.monthly(channelId, partner, 2_000_000L, "2026-09");

        var postings = capturePostings();
        assertThat(postings.stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(postings)
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, 2_000_000L))
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, partner, -2_000_000L));
        verify(ledger).post(eq(TransactionKind.PARTNER_MONTHLY),
                eq("partner-monthly:" + channelId + ":2026-09"), any(), anyString(), any());
    }

    @Test
    @DisplayName("the monthly key carries the month, so next month pays again")
    void monthlyKeyCarriesThePeriod() {
        // A key of channel alone would pay the partner once and never again.
        service.monthly(channelId, partner, 2_000_000L, "2026-09");
        service.monthly(channelId, partner, 2_000_000L, "2026-10");

        verify(ledger).post(any(), eq("partner-monthly:" + channelId + ":2026-09"),
                any(), anyString(), any());
        verify(ledger).post(any(), eq("partner-monthly:" + channelId + ":2026-10"),
                any(), anyString(), any());
    }

    /** The hold never touches the wallet when the seller cannot cover it. */
    @Test
    @DisplayName("a hold that cannot be covered posts nothing at all")
    void refusedHoldPostsNothing() {
        when(ledger.balanceOf(seller)).thenReturn(walletWith(300_000L));

        assertThatThrownBy(() -> service.hold(orderId, seller, 500_000L))
                .isInstanceOf(ResponseStatusException.class);

        verify(ledger, never()).post(any(), anyString(), any(), anyString(), any());
    }

    private List<Posting> capturePostings() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Posting>> captor =
                (ArgumentCaptor<List<Posting>>) (ArgumentCaptor<?>) ArgumentCaptor.forClass(List.class);
        verify(ledger).post(any(), anyString(), any(), anyString(), captor.capture());
        return captor.getValue();
    }

    private static WalletAccount walletWith(long availableTiyin) {
        return WalletAccount.builder()
                .userId(UUID.randomUUID())
                .availableTiyin(availableTiyin)
                .build();
    }
}
