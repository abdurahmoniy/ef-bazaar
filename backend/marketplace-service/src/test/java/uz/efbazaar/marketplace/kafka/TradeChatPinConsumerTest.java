package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ChatTradePinRepository;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class TradeChatPinConsumerTest {

    private final ChatRepository chats = mock(ChatRepository.class);
    private final ChatTradePinRepository pins = mock(ChatTradePinRepository.class);
    private final TradeChatPinConsumer consumer = new TradeChatPinConsumer(chats, pins);

    @Test
    void onOpenedUpsertsAPinnedRowAndRecomputesTheChat() {
        UUID chatId = UUID.randomUUID(), tradeId = UUID.randomUUID();
        Instant occurredAt = Instant.now();
        when(chats.existsById(chatId)).thenReturn(true);

        consumer.onOpened(new TradeChatPinDto(tradeId, chatId, occurredAt));

        verify(pins).upsert(any(UUID.class), eq(chatId), eq(tradeId), eq(true), eq(occurredAt));
        verify(chats).recomputeSystemImportant(chatId);
    }

    @Test
    void onClosedUpsertsAnUnpinnedRowAndRecomputesTheChat() {
        UUID chatId = UUID.randomUUID(), tradeId = UUID.randomUUID();
        Instant occurredAt = Instant.now();
        when(chats.existsById(chatId)).thenReturn(true);

        consumer.onClosed(new TradeChatPinDto(tradeId, chatId, occurredAt));

        verify(pins).upsert(any(UUID.class), eq(chatId), eq(tradeId), eq(false), eq(occurredAt));
        verify(chats).recomputeSystemImportant(chatId);
    }

    @Test
    void ignoresANullEvent() {
        consumer.onOpened(null);

        verifyNoInteractions(pins);
        verifyNoInteractions(chats);
    }

    @Test
    void ignoresAnEventWithNoChatId() {
        consumer.onOpened(new TradeChatPinDto(UUID.randomUUID(), null, Instant.now()));

        verifyNoInteractions(pins);
        verifyNoInteractions(chats);
    }

    @Test
    void ignoresAnEventWithNoTradeId() {
        consumer.onOpened(new TradeChatPinDto(null, UUID.randomUUID(), Instant.now()));

        verifyNoInteractions(pins);
        verifyNoInteractions(chats);
    }

    @Test
    void unknownChatIsSkippedWithoutUpserting() {
        UUID chatId = UUID.randomUUID(), tradeId = UUID.randomUUID();
        when(chats.existsById(chatId)).thenReturn(false);

        consumer.onOpened(new TradeChatPinDto(tradeId, chatId, Instant.now()));

        verifyNoInteractions(pins);
        verify(chats, never()).recomputeSystemImportant(any());
    }

    @Test
    void missingOccurredAtDefaultsToNow() {
        UUID chatId = UUID.randomUUID(), tradeId = UUID.randomUUID();
        when(chats.existsById(chatId)).thenReturn(true);

        consumer.onOpened(new TradeChatPinDto(tradeId, chatId, null));

        verify(pins).upsert(any(UUID.class), eq(chatId), eq(tradeId), eq(true), any(Instant.class));
    }
}
