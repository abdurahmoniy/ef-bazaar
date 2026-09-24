package uz.efbazaar.marketplace.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class ChatSocketSignals {
    public static final String CHANNEL = "chat:signals";
    private final StringRedisTemplate redis;
    private final java.util.Set<UUID> pending = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private final java.util.concurrent.atomic.AtomicBoolean resyncRequired = new java.util.concurrent.atomic.AtomicBoolean();

    public void changed(UUID chatId) {
        if (chatId == null) return;
        Runnable publish = () -> {
            try { redis.convertAndSend(CHANNEL, "changed:" + chatId); }
            catch (RuntimeException e) {
                if (pending.size() < 10000) pending.add(chatId);
                else resyncRequired.set(true);
                log.warn("Chat committed; real-time notification queued for {}", chatId);
            }
        };
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { publish.run(); }
            });
        } else publish.run();
    }
    /** Bound outage memory; if the set overflows, a reconnect recovers every snapshot. */
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 1000)
    public void retryPending() {
        try {
            if (resyncRequired.getAndSet(false)) {
                try { redis.convertAndSend(CHANNEL, "resync"); }
                catch (RuntimeException e) { resyncRequired.set(true); throw e; }
            }
            for (UUID chatId : pending.stream().limit(200).toList()) {
                if (!pending.remove(chatId)) continue;
                // Claim before sending so a newer failed invalidation for this chat survives.
                try { redis.convertAndSend(CHANNEL, "changed:" + chatId); }
                catch (RuntimeException e) { pending.add(chatId); throw e; }
            }
        } catch (RuntimeException ignored) { /* Keep pending invalidations until Redis recovers. */ }
    }
}
