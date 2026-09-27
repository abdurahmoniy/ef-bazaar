package uz.efbazaar.trade.trade;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.redis.core.*;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.marketplace.ListingTermsClient;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.*;
import uz.efbazaar.trade.trade.service.*;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ProposalFeePayerTest {
    @ParameterizedTest
    @ValueSource(strings = {"SELLER", "BUYER", "SPLIT"})
    @SuppressWarnings("unchecked")
    void proposalRetainsTheChosenFeePayerAndExactQuoteThroughAcceptance(String payer) throws Exception {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), listing = UUID.randomUUID(), chat = UUID.randomUUID();
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForHash()).thenReturn(hashes);
        when(redis.opsForValue()).thenReturn(values);
        ListingTermsClient listings = mock(ListingTermsClient.class);
        when(listings.fetch(listing)).thenReturn(new ListingTermsClient.ListingTerms(
                listing, seller, BigDecimal.valueOf(20000), "ACTIVE", "BOTH"));
        EscrowClient escrow = mock(EscrowClient.class);
        long buyerHold = payer.equals("SELLER") ? 0 : payer.equals("BUYER") ? 500001 : 250001;
        long sellerHold = 500001 - buyerHold;
        when(escrow.quote(any(), eq(buyer), eq(seller), eq(0L), eq(20000L), eq(AdminFeePayer.valueOf(payer))))
                .thenReturn(new EscrowClient.Quote(500001, buyerHold, sellerHold));
        TradeService trades = mock(TradeService.class);
        var service = new TradeProposalService(redis, mock(TradeEventPublisher.class), trades,
                mock(TradeAuditService.class), mock(TradeAdminProfileService.class), escrow, listings);
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var request = mapper.readValue("""
                {"marketplaceChatId":"%s","otherPartyUserId":"%s","sellerId":"%s","buyerId":"%s",
                 "amountUzs":0,"listingId":"%s","kind":"SWAP","adminFeePayer":"%s"}
                """.formatted(chat, buyer, seller, buyer, listing, payer), ProposalCreateRequest.class);
        var receipt = service.create(seller, request);
        assertThat(receipt.adminFeePayer()).isEqualTo(AdminFeePayer.valueOf(payer));
        assertThat(receipt.adminFeeTiyin()).isEqualTo(500001);
        assertThat(receipt.buyerHoldTiyin()).isEqualTo(buyerHold);
        assertThat(receipt.sellerHoldTiyin()).isEqualTo(sellerHold);
        var captured = org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(hashes).putAll(anyString(), captured.capture());
        when(hashes.entries(anyString())).thenReturn(captured.getValue());
        when(values.get(anyString())).thenReturn(receipt.proposalId().toString());
        var details = service.findActiveProposalByChatId(chat, buyer).orElseThrow();
        assertThat(details.adminFeePayer()).isEqualTo(AdminFeePayer.valueOf(payer));
        assertThat(details.adminFeeTiyin()).isEqualTo(500001);
        assertThat(details.buyerHoldTiyin()).isEqualTo(buyerHold);
        assertThat(details.sellerHoldTiyin()).isEqualTo(sellerHold);
        assertThat(service.findActiveProposalByChatId(chat, UUID.randomUUID())).isEmpty();
        var trade = new TradeResponse(UUID.randomUUID(), null, seller, buyer, 0L,
                null, null, chat, null, null, null, null, null, null, TradeKind.SWAP,
                null, null, null, null, null, AdminFeePayer.valueOf(payer));
        when(trades.openTrade(any(), eq(seller), eq(buyer), eq(0L), isNull(), isNull(), eq(listing),
                eq(chat), eq(TradeMode.SMART), isNull(), isNull(), eq(TradeKind.SWAP), eq(20000L), eq(AdminFeePayer.valueOf(payer))))
                .thenReturn(trade);
        assertThat(service.accept(buyer, receipt.proposalId(), null)).isSameAs(trade);
        verify(escrow).hold(any(), eq(buyer), eq(seller), eq(0L), eq(20000L), eq(AdminFeePayer.valueOf(payer)), eq(500001L));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @SuppressWarnings("unchecked")
    void aStrangerCannotAcceptOrForgeAProposalAndChargeEitherParticipant(boolean forgedProposer) {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        when(redis.opsForHash()).thenReturn(hashes);
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        when(hashes.entries(anyString())).thenReturn(Map.of("proposerUserId", (forgedProposer ? UUID.randomUUID() : seller).toString(),
                "sellerId", seller.toString(), "buyerId", buyer.toString(), "amountUzs", "500000"));
        EscrowClient escrow = mock(EscrowClient.class);
        TradeService trades = mock(TradeService.class);
        var service = new TradeProposalService(redis, mock(TradeEventPublisher.class), trades,
                mock(TradeAuditService.class), mock(TradeAdminProfileService.class), escrow, mock(ListingTermsClient.class));
        assertThatThrownBy(() -> service.accept(forgedProposer ? buyer : UUID.randomUUID(), UUID.randomUUID(), null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("403");
        verifyNoInteractions(escrow, trades);
    }

    @ParameterizedTest
    @ValueSource(strings = {"OUTSIDER", "SAME_PARTY", "WRONG_COUNTERPART"})
    void malformedRolesCannotPublishAProposal(String invalid) {
        UUID seller = UUID.randomUUID(), buyer = invalid.equals("SAME_PARTY") ? seller : UUID.randomUUID();
        UUID proposer = invalid.equals("OUTSIDER") ? UUID.randomUUID() : seller;
        UUID other = invalid.equals("WRONG_COUNTERPART") ? UUID.randomUUID() : buyer;
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        EscrowClient escrow = mock(EscrowClient.class);
        TradeEventPublisher events = mock(TradeEventPublisher.class);
        var service = new TradeProposalService(redis, events, mock(TradeService.class),
                mock(TradeAuditService.class), mock(TradeAdminProfileService.class), escrow, mock(ListingTermsClient.class));
        var request = new ProposalCreateRequest(UUID.randomUUID(), other, seller, buyer,
                0L, null, UUID.randomUUID(), TradeMode.SMART, null, null, TradeKind.SWAP, AdminFeePayer.BUYER);
        assertThatThrownBy(() -> service.create(proposer, request))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(redis, escrow, events);
    }
}
