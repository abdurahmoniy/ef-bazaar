package uz.efbazaar.trade.trade;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.controller.TradeActionController;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;

class TradeEmailNotificationTest {
    @ParameterizedTest
    @CsvSource({"SALE, SELLER", "SWAP, SELLER", "SWAP, BUYER",
            "SWAP_SURCHARGE, SELLER", "SWAP_SURCHARGE, BUYER"})
    void emailChangeNotifiesTheOtherParticipant(TradeKind kind, ParticipantRole actorRole) {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID actor = actorRole == ParticipantRole.SELLER ? seller : buyer;
        UUID recipient = actorRole == ParticipantRole.SELLER ? buyer : seller;
        Trade trade = Trade.builder().id(UUID.randomUUID()).chatId(UUID.randomUUID())
                .sellerId(seller).buyerId(buyer).kind(kind).priceUzs(500_000L).build();
        TradeService trades = mock(TradeService.class);
        TradeEventPublisher events = mock(TradeEventPublisher.class);
        when(trades.get(trade.getId(), actor)).thenReturn(trade);
        TradeActionController controller = new TradeActionController(trades, null, null, null,
                events, null, null);

        controller.emailChanged(new AuthenticatedUser(actor, null, List.of(), "Test"), trade.getId());

        verify(events).tradeAction(trade.getId(), trade.getChatId(), recipient,
                TradeEvents.TradeActionType.EMAIL_CHANGED, trade.getPriceUzs(), null, kind);
        verifyNoMoreInteractions(events);
    }
}
