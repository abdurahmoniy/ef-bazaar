package uz.efbazaar.trade.trade;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.*;
import uz.efbazaar.trade.trade.service.*;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SwapDecisionTest {
    @ParameterizedTest
    @CsvSource({
            "SWAP, SELLER, BUYER_REJECT, BUYER_CONFIRM, REJECTED",
            "SWAP, BUYER, BUYER_REJECT, BUYER_CONFIRM, REJECTED",
            "SWAP, SELLER, BUYER_CONFIRM, BUYER_REJECT, REJECTED",
            "SWAP, BUYER, BUYER_CONFIRM, BUYER_REJECT, REJECTED",
            "SWAP_SURCHARGE, SELLER, BUYER_REJECT, BUYER_CONFIRM, REJECTED",
            "SWAP_SURCHARGE, BUYER, BUYER_CONFIRM, BUYER_REJECT, REJECTED",
            "SWAP, SELLER, BUYER_CONFIRM, BUYER_CONFIRM, SUCCESS",
            "SWAP_SURCHARGE, BUYER, BUYER_CONFIRM, BUYER_CONFIRM, SUCCESS"
    })
    void bothDecisionsDetermineTheOutcome(TradeKind kind, ParticipantRole firstRole,
                                        TradeEvent firstDecision, TradeEvent secondDecision,
                                        TradeState expected) {
        UUID id = UUID.randomUUID();
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        Trade trade = Trade.builder().id(id).sellerId(seller).buyerId(buyer)
                .kind(kind).mode(TradeMode.SMART).state(TradeState.WAITING_BUYER_VERIFY).build();
        TradeSide sellerSide = TradeSide.builder().id(new TradeSideId(id, ParticipantRole.SELLER)).build();
        TradeSide buyerSide = TradeSide.builder().id(new TradeSideId(id, ParticipantRole.BUYER)).build();
        TradeRepository repository = mock(TradeRepository.class);
        when(repository.findByIdForUpdate(id)).thenReturn(Optional.of(trade));
        TradeSideRepository sideRepository = mock(TradeSideRepository.class);
        when(sideRepository.findByIdTradeId(id)).thenReturn(List.of(sellerSide, buyerSide));
        when(sideRepository.find(id, ParticipantRole.SELLER)).thenReturn(Optional.of(sellerSide));
        when(sideRepository.find(id, ParticipantRole.BUYER)).thenReturn(Optional.of(buyerSide));
        TradeSideService sides = new TradeSideService(sideRepository, mock(MailboxRepository.class));
        TradeStateHandler handler = mock(TradeStateHandler.class);
        TradeService service = new TradeService(repository, mock(TradeChatRepository.class),
                mock(TradeMessageRepository.class), new TradeStateMachine(), handler, sides,
                mock(TradeAuditService.class), null, null, mock(TradeBroadcaster.class), null, null, mock(uz.efbazaar.trade.plan.service.MailboxQuotaLock.class), mock(uz.efbazaar.trade.mailbox.provision.ProvisioningClaimService.class)) {
            @Override
            public TradeResponse toResponse(Trade current, ParticipantRole role) { return null; }
        };
        UUID first = firstRole == ParticipantRole.SELLER ? seller : buyer;
        UUID second = firstRole == ParticipantRole.SELLER ? buyer : seller;

        service.transition(id, firstDecision, ActorType.USER, first);
        assertThat(trade.getState()).as("one decision still waits for the counterpart")
                .isEqualTo(TradeState.WAITING_BUYER_VERIFY);
        verifyNoInteractions(handler);

        service.transition(id, secondDecision, ActorType.USER, second);
        assertThat(trade.getState()).as("one rejection prevents the accounts crossing")
                .isEqualTo(expected);
        verify(handler).onEnter(eq(trade), eq(expected), eq(ActorType.USER), eq(second), any());
        if (expected == TradeState.REJECTED) {
            verify(handler, never()).onEnter(any(), eq(TradeState.SUCCESS), any(), any(), any());
        }
    }
}
