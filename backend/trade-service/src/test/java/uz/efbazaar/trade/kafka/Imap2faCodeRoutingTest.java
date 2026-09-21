package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeChat;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeSideId;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;
import uz.efbazaar.trade.trade.repository.TradeSideRepository;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Kirish kodi kimga ketadi.
 *
 * <p>Kod qutining EGASIGA emas, uni qabul qilayotgan tarafga kerak: sotuvchi
 * o'z akkountini o'sha quti orqali o'tkazgan, unga kirmoqchi bo'lgan esa
 * xaridor. Adashtirilsa kod akkountga kira olmayotgan odamga emas, allaqachon
 * chiqib ketgan odamga borardi.
 */
@ExtendWith(MockitoExtension.class)
class Imap2faCodeRoutingTest {

    @Mock TradeChatRepository chats;
    @Mock TradeMessageRepository messages;
    @Mock TradeBroadcaster broadcaster;
    @Mock TradeSideRepository sides;
    @Mock MailboxRepository mailboxes;
    @InjectMocks Imap2faCodeConsumer consumer;

    private final UUID tradeId = UUID.randomUUID();

    private static TradeSide side(UUID tradeId, ParticipantRole role, UUID mailboxId) {
        return TradeSide.builder().id(new TradeSideId(tradeId, role)).mailboxId(mailboxId).build();
    }

    private TradeChat chatFor() {
        TradeChat chat = new TradeChat();
        chat.setId(UUID.randomUUID());
        return chat;
    }

    @Test
    void aCodeFromTheSellersMailboxGoesToTheBuyer() {
        UUID sellerBox = UUID.randomUUID();
        Mailbox mb = new Mailbox();
        mb.setId(sellerBox);
        when(mailboxes.findByEmail("trade-a@efbazaar.uz")).thenReturn(Optional.of(mb));
        when(sides.findByIdTradeId(tradeId)).thenReturn(List.of(
                side(tradeId, ParticipantRole.SELLER, sellerBox),
                side(tradeId, ParticipantRole.BUYER, UUID.randomUUID())));
        when(chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.BUYER))
                .thenReturn(Optional.of(chatFor()));

        consumer.onCode(new TradeEvents.Imap2faCode(
                tradeId, "554433", "trade-a@efbazaar.uz", Instant.now()));

        verify(sides).recordLoginCode(eq(tradeId), eq(ParticipantRole.BUYER), eq("554433"), any());
        verify(broadcaster).publishMessage(eq(tradeId), eq(ParticipantRole.BUYER), any());
    }

    @Test
    void aCodeFromTheBuyersMailboxGoesToTheSeller() {
        UUID buyerBox = UUID.randomUUID();
        Mailbox mb = new Mailbox();
        mb.setId(buyerBox);
        when(mailboxes.findByEmail("trade-b@efbazaar.uz")).thenReturn(Optional.of(mb));
        when(sides.findByIdTradeId(tradeId)).thenReturn(List.of(
                side(tradeId, ParticipantRole.SELLER, UUID.randomUUID()),
                side(tradeId, ParticipantRole.BUYER, buyerBox)));
        when(chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.SELLER))
                .thenReturn(Optional.of(chatFor()));

        consumer.onCode(new TradeEvents.Imap2faCode(
                tradeId, "112233", "trade-b@efbazaar.uz", Instant.now()));

        verify(sides).recordLoginCode(eq(tradeId), eq(ParticipantRole.SELLER), eq("112233"), any());
    }

    /** Eski hodisada manzil yo'q — sotuvda oluvchi har doim xaridor. */
    @Test
    void anEventWithoutAMailboxFallsBackToTheBuyer() {
        when(chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.BUYER))
                .thenReturn(Optional.of(chatFor()));

        consumer.onCode(new TradeEvents.Imap2faCode(tradeId, "998877", null, Instant.now()));

        verify(sides).recordLoginCode(eq(tradeId), eq(ParticipantRole.BUYER), eq("998877"), any());
    }
}
