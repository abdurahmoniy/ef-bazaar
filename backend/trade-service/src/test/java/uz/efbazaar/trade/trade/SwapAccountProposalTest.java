package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.marketplace.ListingTermsClient;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.*;

import java.math.BigDecimal;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SwapAccountProposalTest {
    private final UUID seller = UUID.randomUUID();
    private final UUID buyer = UUID.randomUUID();
    private final UUID listing = UUID.randomUUID();
    private final UUID proposal = UUID.randomUUID();
    private final UUID account = UUID.randomUUID();
    private final GiveAccountSnapshot snapshot = new GiveAccountSnapshot(account, "Asosiy akk", "m-1", "Kuchli", 3250);

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final TradeService trades = mock(TradeService.class);
    private final EscrowClient escrow = mock(EscrowClient.class);
    private final ListingTermsClient listings = mock(ListingTermsClient.class);
    private final SwapAccountGuard guard = mock(SwapAccountGuard.class);
    private final TradeProposalService service = new TradeProposalService(redis,
            mock(TradeEventPublisher.class), trades, mock(TradeAuditService.class),
            mock(TradeAdminProfileService.class), escrow, listings, guard);

    private TradeResponse trade(TradeKind kind) {
        return new TradeResponse(UUID.randomUUID(), null, seller, buyer, 0,
                null, null, null, null, null, null, null, null, null, kind, null, null, null, null, null);
    }

    private void storedProposal(UUID proposer, TradeKind kind, Map<String, String> extra) {
        when(redis.opsForHash()).thenReturn(hashes);
        Map<Object, Object> raw = new HashMap<>(Map.of(
                "proposerUserId", proposer.toString(), "sellerId", seller.toString(),
                "buyerId", buyer.toString(), "amountUzs", kind == TradeKind.SWAP ? "0" : "5000",
                "listingId", listing.toString(), "kind", kind.name()));
        raw.putAll(extra);
        when(hashes.entries(anyString())).thenReturn(raw);
        when(listings.fetch(listing)).thenReturn(new ListingTermsClient.ListingTerms(
                listing, seller, BigDecimal.valueOf(20000), "ACTIVE", "BOTH"));
        TradeResponse opened = trade(kind);
        when(trades.openTrade(any(UUID.class), eq(seller), eq(buyer), anyLong(), any(), any(), eq(listing),
                any(), any(), any(), any(), eq(kind), anyLong(), any())).thenReturn(opened);
        when(trades.attachGiveAccount(any(), any(), any())).thenReturn(opened);
    }

    @Test
    void theBuyerPicksTheirAccountWhenAcceptingASellersSwap() {
        storedProposal(seller, TradeKind.SWAP, Map.of());
        when(guard.check(account, buyer, TradeKind.SWAP)).thenReturn(snapshot);

        service.accept(buyer, proposal, null, account);

        verify(trades).attachGiveAccount(any(UUID.class), eq(snapshot), eq(ParticipantRole.BUYER));
    }

    @Test
    void acceptingWithoutAnAccountIsOther() {
        // Eski frontend giveAccountId yubormaydi — "Boshqa" sifatida o'tishi kerak.
        storedProposal(seller, TradeKind.SWAP, Map.of());

        service.accept(buyer, proposal, null, null);

        verify(guard).check(null, buyer, TradeKind.SWAP);
        verify(trades, never()).attachGiveAccount(any(), any(), any());
    }

    @Test
    void theSellerCannotChooseTheBuyersAccount() {
        storedProposal(buyer, TradeKind.SWAP, Map.of());
        assertThatThrownBy(() -> service.accept(seller, proposal, null, account))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(escrow);
        verify(trades, never()).openTrade(any(UUID.class), any(), any(), anyLong(), any(), any(), any(),
                any(), any(), any(), any(), any(), anyLong(), any());
    }

    @Test
    void aBuyersOwnProposalKeepsItsAccountAndIsRecheckedAtAccept() {
        storedProposal(buyer, TradeKind.SWAP, Map.of("giveAccountId", account.toString()));
        when(guard.check(account, buyer, TradeKind.SWAP)).thenReturn(snapshot);

        service.accept(seller, proposal, null, null);

        verify(guard).check(account, buyer, TradeKind.SWAP);
        verify(trades).attachGiveAccount(any(UUID.class), eq(snapshot), eq(ParticipantRole.SELLER));
    }

    @Test
    void anAccountThatBecameBusyStopsTheAcceptBeforeMoneyMoves() {
        storedProposal(seller, TradeKind.SWAP_SURCHARGE, Map.of());
        when(guard.check(account, buyer, TradeKind.SWAP_SURCHARGE))
                .thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "busy"));

        assertThatThrownBy(() -> service.accept(buyer, proposal, null, account))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(escrow);
    }

    @Test
    void aBuyersSwapProposalStoresTheCheckedSnapshot() {
        when(redis.opsForHash()).thenReturn(hashes);
        when(redis.opsForValue()).thenReturn(values);
        when(guard.check(account, buyer, TradeKind.SWAP)).thenReturn(snapshot);
        var smart = new ProposalCreateRequest(UUID.randomUUID(), seller, seller, buyer,
                0L, null, listing, TradeMode.SMART, null, null, TradeKind.SWAP, null, account);
        when(listings.fetch(listing)).thenReturn(new ListingTermsClient.ListingTerms(
                listing, seller, BigDecimal.valueOf(20000), "ACTIVE", "BOTH"));
        when(escrow.quote(any(), any(), any(), anyLong(), anyLong(), any()))
                .thenReturn(new EscrowClient.Quote(0, 0, 0));

        service.create(buyer, smart);

        @SuppressWarnings("unchecked")
        var captor = org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(hashes).putAll(anyString(), captor.capture());
        assertThat(captor.getValue()).containsEntry("giveAccountId", account.toString())
                .containsEntry("giveAccountTitle", "Asosiy akk")
                .containsEntry("giveAccountCover", "m-1")
                .containsEntry("giveAccountTs", "3250");
    }

    @Test
    void aSellerCannotAttachAnAccountToTheirProposal() {
        var request = new ProposalCreateRequest(UUID.randomUUID(), buyer, seller, buyer,
                0L, null, listing, TradeMode.SMART, null, null, TradeKind.SWAP, null, account);
        assertThatThrownBy(() -> service.create(seller, request)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(redis);
    }
}
