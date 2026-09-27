package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import uz.efbazaar.trade.kafka.*;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.*;
import uz.efbazaar.trade.trade.service.*;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TradeTurnNotificationTest {
    final UUID id = UUID.randomUUID(), seller = UUID.randomUUID(), buyer = UUID.randomUUID();
    final Trade trade = Trade.builder().id(id).chatId(UUID.randomUUID()).sellerId(seller).buyerId(buyer)
            .mode(TradeMode.SMART).kind(TradeKind.SALE).state(TradeState.WAITING_PAYMENT).build();
    final TradeSide sellerSide = TradeSide.builder().id(new TradeSideId(id, ParticipantRole.SELLER)).build();
    final TradeSide buyerSide = TradeSide.builder().id(new TradeSideId(id, ParticipantRole.BUYER)).build();
    final TradeEventPublisher events = mock(TradeEventPublisher.class);
    final TradeStateHandler handler = mock(TradeStateHandler.class);
    final TradeService service;
    TradeTurnNotificationTest() {
        var repo = mock(TradeRepository.class);
        when(repo.findByIdForUpdate(id)).thenReturn(Optional.of(trade));
        var sides = mock(TradeSideRepository.class);
        when(sides.findByIdTradeId(id)).thenReturn(List.of(sellerSide, buyerSide));
        when(sides.find(id, ParticipantRole.SELLER)).thenReturn(Optional.of(sellerSide));
        when(sides.find(id, ParticipantRole.BUYER)).thenReturn(Optional.of(buyerSide));
        service = new TradeService(repo, null, null, new TradeStateMachine(), handler,
                new TradeSideService(sides, mock(MailboxRepository.class)), mock(TradeAuditService.class),
                null, null, mock(TradeBroadcaster.class), events, null) {
            @Override public TradeResponse toResponse(Trade t, ParticipantRole role) { return null; }
        };
    }
    @ParameterizedTest @CsvSource({
        "WAITING_PAYMENT,PAYMENT_CONFIRMED,WAITING_EMAIL_CHANGE,SELLER",
        "WAITING_EMAIL_CHANGE,EMAIL_CHANGED,VERIFYING_KONAMI_LINK,SELLER",
        "VERIFYING_KONAMI_LINK,KONAMI_EMAIL_RECEIVED,WAITING_PASSWORD,SELLER",
        "WAITING_PASSWORD,PASSWORD_SENT,WAITING_BUYER_VERIFY,BUYER"
    })
    void saleNotifiesOnlyTheParticipantWhoMustAct(TradeState from, TradeEvent event, String next, ParticipantRole role) {
        trade.setState(from);
        service.transition(id, event, ActorType.USER, seller);
        verifyTurn(role == ParticipantRole.SELLER ? seller : buyer, next);
        verifyNoMoreInteractions(events);
    }
    @Test void swapStageEntryNotifiesBothAndPartialProgressOnlyRemindsTheOutstandingSideOnce() {
        trade.setKind(TradeKind.SWAP);
        service.transition(id, TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);
        verifyTurn(seller, "WAITING_EMAIL_CHANGE");
        verifyTurn(buyer, "WAITING_EMAIL_CHANGE");
        clearInvocations(events);
        service.transition(id, TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        service.transition(id, TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        verifyTurn(buyer, "WAITING_EMAIL_CHANGE");
        verifyNoMoreInteractions(events);
        clearInvocations(events);
        service.transition(id, TradeEvent.EMAIL_CHANGED, ActorType.USER, buyer);
        verifyTurn(seller, "VERIFYING_KONAMI_LINK");
        verifyTurn(buyer, "VERIFYING_KONAMI_LINK");
        verifyNoMoreInteractions(events);
    }
    @ParameterizedTest @CsvSource({"SELLER", "BUYER"})
    void swapConfirmationRemindsOnlyTheUndecidedPartner(ParticipantRole first) {
        trade.setKind(TradeKind.SWAP_SURCHARGE);
        trade.setState(TradeState.WAITING_BUYER_VERIFY);
        UUID actor = first == ParticipantRole.SELLER ? seller : buyer;
        service.transition(id, TradeEvent.BUYER_CONFIRM, ActorType.USER, actor);
        service.transition(id, TradeEvent.BUYER_CONFIRM, ActorType.USER, actor);
        verifyTurn(first == ParticipantRole.SELLER ? buyer : seller, "WAITING_BUYER_VERIFY");
        verifyNoMoreInteractions(events);
    }
    @Test void recheckAndTerminalTransitionsDoNotSendTurnMessages() {
        trade.setState(TradeState.VERIFYING_KONAMI_LINK);
        service.transition(id, TradeEvent.RECHECK, ActorType.USER, seller);
        trade.setState(TradeState.WAITING_BUYER_VERIFY);
        service.transition(id, TradeEvent.BUYER_CONFIRM, ActorType.USER, buyer);
        verifyNoInteractions(events);
    }
    @Test void invalidActionNeverSendsATurnMessage() {
        assertThatThrownBy(() -> service.transition(id, TradeEvent.PASSWORD_SENT, ActorType.USER, seller))
                .isInstanceOf(uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException.class);
        verifyNoInteractions(events);
    }
    @Test void humanCloseAsksBothParticipantsToConfirm() {
        trade.setMode(TradeMode.HUMAN);
        trade.setState(TradeState.IN_PROGRESS);
        service.transition(id, TradeEvent.ADMIN_CLOSED, ActorType.TRADE_ADMIN, UUID.randomUUID());
        verifyTurn(seller, "WAITING_CLOSE_CONFIRM");
        verifyTurn(buyer, "WAITING_CLOSE_CONFIRM");
        verifyNoMoreInteractions(events);
    }
    @Test void declinedAdminMakesItTheSellersTurnAgain() {
        trade.setMode(TradeMode.HUMAN);
        trade.setState(TradeState.WAITING_ADMIN);
        trade.setAssignedAdminId(UUID.randomUUID());
        doAnswer(call -> { trade.setAssignedAdminId(null); return null; }).when(handler)
                .onEnter(eq(trade), eq(TradeState.WAITING_ADMIN), any(), any(), eq(TradeEvent.ADMIN_DECLINED));
        service.transition(id, TradeEvent.ADMIN_DECLINED, ActorType.TRADE_ADMIN, trade.getAssignedAdminId());
        verifyTurn(seller, "WAITING_ADMIN");
        verifyNoMoreInteractions(events);
    }
    @Test void headlessTradeDoesNotPublishUnusableTurnLinks() {
        trade.setChatId(null);
        service.transition(id, TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);
        verifyNoInteractions(events);
    }
    private void verifyTurn(UUID user, String step) {
        verify(events).tradeAction(eq(id), eq(trade.getChatId()), eq(user),
                argThat(type -> type.name().equals("YOUR_TURN")), eq(0L), eq(step), eq(trade.getKind()));
    }
}
