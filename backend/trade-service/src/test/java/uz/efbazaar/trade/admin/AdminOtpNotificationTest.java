package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.trade.admin.service.AdminSmartTradeService;
import uz.efbazaar.trade.kafka.*;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.*;
import uz.efbazaar.trade.trade.service.*;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.security.AuthSummaryClient;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@ExtendWith(MockitoExtension.class)
class AdminOtpNotificationTest {
    @Mock TradeRepository trades;
    @Mock TradeSideService sides;
    @Mock TradeSideRepository sideRepo;
    @Mock MailboxService mailboxes;
    @Mock TradeService tradeService;
    @Mock TradeAuditService audit;
    @Mock TradeChatService chat;
    @Mock AuthSummaryClient users;
    @Mock TradeEventPublisher events;
    @Mock ChatChangePublisher changes;
    @InjectMocks AdminSmartTradeService service;
    @Test void manuallyFoundLoginCodeNotifiesTheBuyer() {
        UUID id = UUID.randomUUID(), buyer = UUID.randomUUID(), chatId = UUID.randomUUID();
        Trade t = Trade.builder().id(id).buyerId(buyer).sellerId(UUID.randomUUID()).chatId(chatId)
                .kind(TradeKind.SALE).mode(TradeMode.SMART).state(TradeState.WAITING_BUYER_VERIFY).build();
        when(trades.findById(id)).thenReturn(Optional.of(t));
        when(sideRepo.recordLoginCode(eq(id), eq(ParticipantRole.BUYER), eq("001234"), any())).thenReturn(1);
        service.submitLoginCode(UUID.randomUUID(), id, ParticipantRole.BUYER, "001234");
        verify(events).tradeAction(eq(id), eq(chatId), eq(buyer), eq(TradeEvents.TradeActionType.LOGIN_CODE_RECEIVED), anyLong(), eq("001234"), eq(TradeKind.SALE), any());
        verify(changes).publishForTrade(id);
    }
}
