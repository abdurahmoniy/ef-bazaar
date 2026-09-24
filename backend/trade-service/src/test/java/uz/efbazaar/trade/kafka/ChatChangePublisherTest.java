package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.*;

class ChatChangePublisherTest {
    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
    private final TradeRepository trades = mock(TradeRepository.class);
    private final ChatChangePublisher publisher = new ChatChangePublisher(kafka, trades);

    @AfterEach
    void clearTransaction() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void committedChangesContainOnlyTheMarketplaceChatId() {
        UUID chatId = UUID.randomUUID();
        when(kafka.send(anyString(), anyString(), any())).thenReturn(CompletableFuture.completedFuture(null));
        TransactionSynchronizationManager.initSynchronization();
        publisher.publish(chatId);
        verifyNoInteractions(kafka);
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(kafka).send("chat.changed.v1", chatId.toString(), Map.of("chatId", chatId));
    }

    @Test
    void rolledBackChangesNeverInvalidateClients() {
        TransactionSynchronizationManager.initSynchronization();
        publisher.publish(UUID.randomUUID());
        TransactionSynchronizationManager.getSynchronizations().forEach(sync ->
                sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        verifyNoInteractions(kafka);
    }

    @Test
    void messagesResolveTheirTradeToTheMarketplaceChat() {
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        when(trades.findById(tradeId)).thenReturn(Optional.of(Trade.builder().id(tradeId).chatId(chatId).build()));
        when(kafka.send(anyString(), anyString(), any())).thenReturn(CompletableFuture.completedFuture(null));
        publisher.publishForTrade(tradeId);
        verify(kafka).send("chat.changed.v1", chatId.toString(), Map.of("chatId", chatId));
    }

    @Test
    void tradesWithoutMarketplaceChatsDoNotPublish() {
        UUID tradeId = UUID.randomUUID();
        when(trades.findById(tradeId)).thenReturn(Optional.of(Trade.builder().id(tradeId).build()));
        publisher.publish(null);
        publisher.publishForTrade(tradeId);
        publisher.publishForTrade(UUID.randomUUID());
        verifyNoInteractions(kafka);
    }

    @Test
    void brokerFailureDoesNotFailAnAlreadyCommittedFinancialCommand() {
        when(kafka.send(anyString(), anyString(), any())).thenThrow(new IllegalStateException("broker unavailable"));
        assertThatCode(() -> publisher.publish(UUID.randomUUID())).doesNotThrowAnyException();
    }
}
