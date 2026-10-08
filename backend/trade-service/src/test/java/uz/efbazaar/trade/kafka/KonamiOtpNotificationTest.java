package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.*;
import uz.efbazaar.trade.trade.service.TradeSideService;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@ExtendWith(MockitoExtension.class)
class KonamiOtpNotificationTest {
    @Mock TradeRepository trades;
    @Mock TradeSideRepository sideRepo;
    @Mock TradeSideService sides;
    @Mock TradeChatRepository chats;
    @Mock TradeMessageRepository messages;
    @Mock TradeBroadcaster broadcaster;
    @Mock MailboxRepository mailboxes;
    @Mock ChatChangePublisher changes;
    @Mock TradeEventPublisher events;
    @InjectMocks KonamiEmailChangeCodeConsumer email;
    @InjectMocks Imap2faCodeConsumer login;
    final UUID id = UUID.randomUUID(), seller = UUID.randomUUID(), buyer = UUID.randomUUID(), chatId = UUID.randomUUID();

    Trade trade(TradeState state, TradeKind kind) {
        return Trade.builder().id(id).sellerId(seller).buyerId(buyer).chatId(chatId)
                .kind(kind).state(state).mode(TradeMode.SMART).priceUzs(100000L).build();
    }
    void emailSetup(TradeKind kind, ParticipantRole role) {
        var side = TradeSide.builder().id(new TradeSideId(id, role)).build();
        lenient().when(trades.findById(id)).thenReturn(Optional.of(trade(TradeState.WAITING_EMAIL_CHANGE, kind)));
        lenient().when(sides.byMailboxEmail(id, "box@efbazaar.uz")).thenReturn(Optional.of(side));
        lenient().when(sideRepo.recordEmailChangeCode(eq(id), eq(role), anyString(), any())).thenReturn(1);
        lenient().when(trades.recordEmailChangeCode(eq(id), anyString(), any())).thenReturn(1);
    }
    @Test void emailChangeCodeNotifiesOnlyTheOwnerIncludingLeadingZero() {
        emailSetup(TradeKind.SALE, ParticipantRole.SELLER);
        email.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(id, "001234", Instant.now(), "noreply@konami.net", "box@efbazaar.uz"));
        verify(events).tradeAction(eq(id), eq(chatId), eq(seller), argThat(t -> t.name().equals("EMAIL_CHANGE_CODE_RECEIVED")), eq(100000L), eq("001234"), eq(TradeKind.SALE), any());
        verify(events, times(1)).tradeAction(any(), any(), any(), any(), anyLong(), any(), any(), any());
    }
    @Test void swapEmailCodeGoesToItsOwnBuyerSide() {
        emailSetup(TradeKind.SWAP, ParticipantRole.BUYER);
        email.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(id, "123456", Instant.now(), "noreply@konami.net", "box@efbazaar.uz"));
        verify(events).tradeAction(eq(id), eq(chatId), eq(buyer), argThat(t -> t.name().equals("EMAIL_CHANGE_CODE_RECEIVED")), anyLong(), eq("123456"), eq(TradeKind.SWAP), any());
    }
    @Test void replayDoesNotNotifyAgain() {
        emailSetup(TradeKind.SALE, ParticipantRole.SELLER);
        when(sideRepo.recordEmailChangeCode(eq(id), any(), any(), any())).thenReturn(0);
        email.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(id, "123456", Instant.now(), "noreply@konami.net", "box@efbazaar.uz"));
        verifyNoInteractions(events);
    }
    @Test void rejectsExpiredAndMalformedEmailCodes() {
        emailSetup(TradeKind.SALE, ParticipantRole.SELLER);
        email.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(id, "123456", Instant.now().minusSeconds(301), "noreply@konami.net", "box@efbazaar.uz"));
        email.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(id, "<b>bad</b>", Instant.now(), "noreply@konami.net", "box@efbazaar.uz"));
        verifyNoInteractions(events, changes);
        verify(sideRepo, never()).recordEmailChangeCode(any(), any(), any(), any());
    }
    @Test void unknownMailboxNeverNotifiesOrStoresCode() {
        lenient().when(trades.findById(id)).thenReturn(Optional.of(trade(TradeState.WAITING_EMAIL_CHANGE, TradeKind.SWAP)));
        email.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(id, "123456", Instant.now(), "noreply@konami.net", "wrong@efbazaar.uz"));
        verifyNoInteractions(events);
        verify(trades, never()).recordEmailChangeCode(any(), any(), any());
    }
    @Test void loginCodeFromBuyerMailboxNotifiesReceivingSeller() {
        UUID box = UUID.randomUUID();
        Mailbox mb = new Mailbox(); mb.setId(box);
        lenient().when(trades.findById(id)).thenReturn(Optional.of(trade(TradeState.WAITING_BUYER_VERIFY, TradeKind.SWAP)));
        when(mailboxes.findByEmail("box@efbazaar.uz")).thenReturn(Optional.of(mb));
        when(sideRepo.findByIdTradeId(id)).thenReturn(List.of(TradeSide.builder().id(new TradeSideId(id, ParticipantRole.BUYER)).mailboxId(box).build()));
        TradeChat chat = new TradeChat(); chat.setId(UUID.randomUUID());
        when(chats.findByTradeIdAndParticipant(id, ParticipantRole.SELLER)).thenReturn(Optional.of(chat));
        when(sideRepo.recordLoginCode(eq(id), eq(ParticipantRole.SELLER), any(), any())).thenReturn(1);
        login.onCode(new TradeEvents.Imap2faCode(id, "012345", "box@efbazaar.uz", Instant.now()));
        verify(events).tradeAction(eq(id), eq(chatId), eq(seller), argThat(t -> t.name().equals("LOGIN_CODE_RECEIVED")), anyLong(), eq("012345"), eq(TradeKind.SWAP), any());
        verify(changes).publishForTrade(id);
    }
}
