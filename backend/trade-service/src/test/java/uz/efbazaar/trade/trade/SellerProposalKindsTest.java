package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.springframework.http.HttpStatus;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.marketplace.ListingTermsClient;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeProposalService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SellerProposalKindsTest {
    private final UUID seller = UUID.randomUUID();
    private final UUID buyer = UUID.randomUUID();
    private final UUID listing = UUID.randomUUID();
    private final UUID proposal = UUID.randomUUID();
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
    private final TradeService trades = mock(TradeService.class);
    private final EscrowClient escrow = mock(EscrowClient.class);
    private final ListingTermsClient listings = mock(ListingTermsClient.class);
    private final TradeProposalService service = new TradeProposalService(redis,
            mock(TradeEventPublisher.class), trades, mock(TradeAuditService.class),
            mock(TradeAdminProfileService.class), escrow, listings);

    private long prepare(TradeKind kind, String exchangeMode, UUID proposer, UUID owner) {
        long amount = kind == TradeKind.SWAP ? 0 : 5000;
        when(redis.opsForHash()).thenReturn(hashes);
        when(hashes.entries(anyString())).thenReturn(Map.of(
                "proposerUserId", proposer.toString(), "sellerId", seller.toString(),
                "buyerId", buyer.toString(), "amountUzs", Long.toString(amount),
                "listingId", listing.toString(), "kind", kind.name()));
        when(listings.fetch(listing)).thenReturn(new ListingTermsClient.ListingTerms(
                listing, owner, BigDecimal.valueOf(20000), "ACTIVE", exchangeMode));
        return amount;
    }

    @Test
    void rejectsAZeroProceedsSaleBeforePublishingAProposal() {
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "No proceeds"))
                .when(escrow).validateSaleAmount(5000);
        var request = new ProposalCreateRequest(UUID.randomUUID(), buyer, seller, buyer,
                5000L, null, listing, TradeMode.SMART, null, null, TradeKind.SALE);
        assertThatThrownBy(() -> service.create(seller, request)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(redis, trades);
    }

    @Test
    void rechecksSaleProceedsAtAcceptanceBeforeHoldingMoney() {
        prepare(TradeKind.SALE, "NONE", seller, seller);
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "No proceeds"))
                .when(escrow).validateSaleAmount(5000);
        assertThatThrownBy(() -> service.accept(buyer, proposal, null)).isInstanceOf(ResponseStatusException.class);
        verify(escrow, never()).hold(any(), any(), any(), anyLong(), anyLong());
        verifyNoInteractions(trades);
    }

    @ParameterizedTest
    @CsvSource({"SALE,NONE", "SALE,EXCHANGE_ONLY", "SALE,EXCHANGE_WITH_SURCHARGE", "SALE,BOTH",
            "SWAP,NONE", "SWAP,EXCHANGE_ONLY", "SWAP,EXCHANGE_WITH_SURCHARGE", "SWAP,BOTH",
            "SWAP_SURCHARGE,NONE", "SWAP_SURCHARGE,EXCHANGE_ONLY",
            "SWAP_SURCHARGE,EXCHANGE_WITH_SURCHARGE", "SWAP_SURCHARGE,BOTH"})
    void acceptsTheOwnersChosenKindAndUsesTheAuthoritativeFeeBase(TradeKind kind, String exchangeMode) {
        long amount = prepare(kind, exchangeMode, seller, seller);
        long feeBase = kind.isSwap() ? 20000 : amount;
        TradeResponse trade = new TradeResponse(UUID.randomUUID(), null, seller, buyer, amount,
                null, null, null, null, null, null, null, null, null, kind, null, null, null, null);
        when(trades.openTrade(any(UUID.class), eq(seller), eq(buyer), eq(amount),
                isNull(), isNull(), eq(listing), isNull(), eq(TradeMode.SMART),
                isNull(), isNull(), eq(kind), eq(feeBase))).thenReturn(trade);

        assertThat(service.accept(buyer, proposal, null)).isSameAs(trade);
        verify(escrow).hold(any(UUID.class), eq(buyer), eq(seller), eq(amount), eq(feeBase));
        if (kind == TradeKind.SALE) verify(escrow).validateSaleAmount(amount);
        else verify(escrow, never()).validateSaleAmount(anyLong());
    }

    @ParameterizedTest
    @CsvSource({"SWAP,NONE", "SWAP_SURCHARGE,NONE", "SWAP_SURCHARGE,EXCHANGE_ONLY"})
    void buyerProposalsStillRespectPublishedExchangeTerms(TradeKind kind, String exchangeMode) {
        prepare(kind, exchangeMode, buyer, seller);
        assertThatThrownBy(() -> service.accept(seller, proposal, null))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(escrow, trades);
    }

    @ParameterizedTest
    @CsvSource({"SWAP,NONE", "SWAP_SURCHARGE,NONE", "SWAP_SURCHARGE,EXCHANGE_ONLY"})
    void aNonOwnerCannotOverridePublishedExchangeTerms(TradeKind kind, String exchangeMode) {
        prepare(kind, exchangeMode, seller, UUID.randomUUID());
        assertThatThrownBy(() -> service.accept(buyer, proposal, null))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(escrow, trades);
    }
}
