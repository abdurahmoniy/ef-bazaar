package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.admin.repository.TradeStepMarkRepository;
import uz.efbazaar.trade.admin.service.*;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.*;
import uz.efbazaar.trade.trade.service.*;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TradeDirectChangeTest {
    @Mock TradeRepository trades;
    @Mock TradeSideRepository sideRepo;
    @Mock TradeSideService sides;
    @Mock ChatChangePublisher changes;
    @Mock TradeService tradeService;
    @Mock TradeAdminProfileService profileService;
    @Mock TradeEventPublisher events;
    @Mock TradeStepMarkRepository steps;
    @Mock TradeChatService chatService;
    @Mock TradeIdleWatchdog idleWatchdog;
    @Mock TradeAuditService audit;
    @InjectMocks KonamiEmailChangeCodeConsumer codes;
    @InjectMocks TradeAdminAssignmentService assignments;
    @InjectMocks TradeStepService checklist;

    @Test
    void workerCodeArrivalInvalidatesWithoutAStateTransition() {
        UUID trade = UUID.randomUUID();
        when(trades.findById(trade)).thenReturn(Optional.of(Trade.builder().id(trade)
                .kind(TradeKind.SALE).mode(TradeMode.SMART).state(TradeState.WAITING_EMAIL_CHANGE).build()));
        when(trades.recordEmailChangeCode(eq(trade), anyString(), any())).thenReturn(1);
        codes.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(trade, "123456", Instant.now(), null, null));
        verify(changes).publishForTrade(trade);
    }

    @Test
    void invitingAnAdminRefreshesTheWaitingTrade() {
        UUID trade = UUID.randomUUID(), chat = UUID.randomUUID(), seller = UUID.randomUUID();
        when(trades.findById(trade)).thenReturn(Optional.of(Trade.builder().id(trade).chatId(chat)
                .sellerId(seller).buyerId(UUID.randomUUID()).mode(TradeMode.HUMAN)
                .state(TradeState.WAITING_ADMIN).build()));
        assignments.assign(seller, trade, UUID.randomUUID(), 1000);
        verify(changes).publish(chat);
    }

    @Test
    void editingAnAlreadyCompletedStepRefreshesEvenWithoutAStatusMessage() {
        UUID trade = UUID.randomUUID(), chat = UUID.randomUUID(), admin = UUID.randomUUID();
        when(trades.findByIdAndViewer(trade, admin)).thenReturn(Optional.of(Trade.builder().id(trade)
                .chatId(chat).assignedAdminId(admin).state(TradeState.IN_PROGRESS).build()));
        when(steps.findByTradeIdAndStep(trade, TradeStep.SELLER_BRIEFED)).thenReturn(Optional.of(
                TradeStepMark.builder().tradeId(trade).step(TradeStep.SELLER_BRIEFED)
                        .completedAt(Instant.now()).completedBy(admin).build()));
        checklist.mark(trade, admin, TradeStep.SELLER_BRIEFED, "Updated note");
        verify(changes).publish(chat);
        verifyNoInteractions(chatService);
    }
}
