package uz.efbazaar.marketplace.websocket;

import org.junit.jupiter.api.*;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.transaction.support.*;
import org.springframework.transaction.*;
import java.util.UUID;
import static org.mockito.Mockito.*;

class ChatSocketSignalsTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final ChatSocketSignals signals = new ChatSocketSignals(redis);
    private final UUID chat = UUID.randomUUID();
    private final TransactionTemplate tx = new TransactionTemplate(new AbstractPlatformTransactionManager() {
        protected Object doGetTransaction() { return new Object(); }
        protected void doBegin(Object transaction, TransactionDefinition definition) { }
        protected void doCommit(DefaultTransactionStatus status) { }
        protected void doRollback(DefaultTransactionStatus status) { }
    });
    @Test void committedChangePublishesOnlyAfterCommit() {
        tx.executeWithoutResult(status -> {
            signals.changed(chat);
            verifyNoInteractions(redis);
        });
        verify(redis).convertAndSend(ChatSocketSignals.CHANNEL, "changed:" + chat);
    }
    @Test void rolledBackChangeNeverPublishes() {
        tx.executeWithoutResult(status -> { signals.changed(chat); status.setRollbackOnly(); });
        verifyNoInteractions(redis);
    }
    @Test void outageAfterCommitDoesNotTurnTheSavedMessageIntoAnError() {
        doThrow(new org.springframework.data.redis.RedisConnectionFailureException("down"))
                .when(redis).convertAndSend(anyString(), anyString());
        tx.executeWithoutResult(status -> signals.changed(chat));
        verify(redis).convertAndSend(ChatSocketSignals.CHANNEL, "changed:" + chat);
    }
    @Test void failedPublicationRetriesWhenRedisRecovers() {
        when(redis.convertAndSend(anyString(), anyString()))
                .thenThrow(new org.springframework.data.redis.RedisConnectionFailureException("down")).thenReturn(1L);
        signals.changed(chat);
        signals.retryPending();
        signals.retryPending();
        verify(redis, times(2)).convertAndSend(ChatSocketSignals.CHANNEL, "changed:" + chat);
    }
    @Test void retryDoesNotLoseANewerFailedChangeForTheSameChat() {
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        when(redis.convertAndSend(anyString(), anyString())).thenAnswer(inv -> {
            int call = calls.getAndIncrement();
            if (call == 0 || call == 2) throw new org.springframework.data.redis.RedisConnectionFailureException("down");
            if (call == 1) signals.changed(chat);
            return 1L;
        });
        signals.changed(chat);
        signals.retryPending();
        signals.retryPending();
        verify(redis, times(4)).convertAndSend(ChatSocketSignals.CHANNEL, "changed:" + chat);
    }
}
