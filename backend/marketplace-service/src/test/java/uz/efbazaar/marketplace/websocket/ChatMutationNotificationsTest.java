package uz.efbazaar.marketplace.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.kafka.*;
import uz.efbazaar.marketplace.repository.*;
import uz.efbazaar.marketplace.service.*;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;

class ChatMutationNotificationsTest {
    private final ChatSocketSignals signals = mock(ChatSocketSignals.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final UUID chatId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private <T> T observed(T target) {
        var factory = new AspectJProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAspect(new ChatMutationNotifications(signals, messages));
        return factory.getProxy();
    }
    @Test void allSharedChatMutationsPublishInvalidations() {
        ChatService service = observed(mock(ChatService.class));
        service.sendMessage(chatId, userId, "hello");
        service.sendMessage(chatId, userId, "hello", null);
        service.sendAttachment(chatId, userId, null, "caption");
        service.editMessage(chatId, UUID.randomUUID(), userId, "edited");
        service.deleteMessage(chatId, UUID.randomUUID(), userId);
        service.markRead(chatId, userId);
        service.markRead(chatId, userId, UUID.randomUUID());
        service.toggleImportant(chatId, userId);
        service.clearHistory(chatId, userId);
        verify(signals, times(9)).changed(chatId);
    }
    @Test void accountRequestOpenAndCancelNotifyBothParticipantSnapshots() {
        ChatAccountRequestService service = observed(mock(ChatAccountRequestService.class));
        service.open(userId, chatId, UUID.randomUUID());
        service.cancel(userId, chatId);
        verify(signals, times(2)).changed(chatId);
    }
    @Test void kafkaProposalCreationAndResolutionNotifyTheCorrectChat() {
        UUID proposalId = UUID.randomUUID();
        when(messages.findFirstByProposalId(proposalId)).thenReturn(Optional.of(ChatMessage.builder().chatId(chatId).build()));
        TradeProposalConsumer consumer = observed(mock(TradeProposalConsumer.class));
        consumer.onCreated(new TradeProposalCreatedDto(proposalId, chatId, userId, 100L, Instant.now(), "SELL", UUID.randomUUID(), Instant.now()));
        consumer.onResolved(new TradeProposalResolvedDto(proposalId, "REJECTED", Instant.now(), null));
        verify(signals, times(2)).changed(chatId);
    }
    @Test void tradeBridgeAndActionEventsNotifyChat() {
        new ChatChangedConsumer(signals).onChanged(new ChatChangedConsumer.Changed(chatId));
        TradeActionConsumer consumer = observed(mock(TradeActionConsumer.class));
        consumer.onTradeAction(new TradeActionDto(UUID.randomUUID(), chatId, userId, "TRADE_STARTED", 100, "", Instant.now()));
        verify(signals, times(2)).changed(chatId);
    }
}
