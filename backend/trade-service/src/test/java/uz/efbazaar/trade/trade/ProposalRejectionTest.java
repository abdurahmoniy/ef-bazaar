package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.marketplace.ListingTermsClient;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;
import uz.efbazaar.trade.trade.service.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ProposalRejectionTest {
    private final UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
    private final UUID proposal = UUID.randomUUID(), chat = UUID.randomUUID();
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
    private final TradeEventPublisher events = mock(TradeEventPublisher.class);
    private final TradeProposalService service = new TradeProposalService(redis, events,
            mock(TradeService.class), mock(TradeAuditService.class), mock(TradeAdminProfileService.class),
            mock(EscrowClient.class), mock(ListingTermsClient.class),
            mock(uz.efbazaar.trade.trade.service.SwapAccountGuard.class));

    @BeforeEach
    void setup() {
        when(redis.opsForHash()).thenReturn(hashes);
        prepare(seller);
    }

    private void prepare(UUID proposer) {
        when(hashes.entries("trade:proposal:" + proposal)).thenReturn(Map.of(
                "sellerId", seller.toString(), "buyerId", buyer.toString(),
                "proposerUserId", proposer.toString(), "marketplaceChatId", chat.toString()));
    }

    @Test
    void buyerCanRejectSellerOfferAndPublishResolution() {
        when(redis.execute(any(RedisScript.class), anyList(), eq(proposal.toString()))).thenReturn(1L);
        service.reject(buyer, proposal);
        verify(redis).execute(any(RedisScript.class), eq(List.of("trade:proposal:" + proposal,
                "trade:proposal:by-chat:" + chat)), eq(proposal.toString()));
        verify(events).proposalResolved(proposal, TradeEvents.ProposalOutcome.REJECTED);
    }

    @ParameterizedTest
    @ValueSource(strings = {"seller", "outsider", "buyer-sender"})
    void forbidsAnyoneExceptReceivingBuyer(String scenario) {
        UUID actor = scenario.equals("seller") ? seller : scenario.equals("outsider") ? UUID.randomUUID() : buyer;
        if (scenario.equals("buyer-sender")) prepare(buyer);
        assertThatThrownBy(() -> service.reject(actor, proposal))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        verify(redis, never()).delete(anyString());
        verify(redis, never()).execute(any(RedisScript.class), anyList(), anyString());
        verifyNoInteractions(events);
    }

    @Test
    void missingOrExpiredOfferCannotBeRejected() {
        when(hashes.entries(anyString())).thenReturn(Map.of());
        assertThatThrownBy(() -> service.reject(buyer, proposal)).isInstanceOf(ProposalNotFoundException.class);
        verifyNoInteractions(events);
    }

    @Test
    void concurrentDeletionDoesNotPublishDuplicateResolution() {
        when(redis.execute(any(RedisScript.class), anyList(), eq(proposal.toString()))).thenReturn(0L);
        assertThatThrownBy(() -> service.reject(buyer, proposal)).isInstanceOf(ProposalNotFoundException.class);
        verifyNoInteractions(events);
    }
}
