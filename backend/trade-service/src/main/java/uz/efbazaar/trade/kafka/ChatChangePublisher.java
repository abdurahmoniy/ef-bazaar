package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Map;
import java.util.UUID;

/** Invalidates participant chat views without putting private trade data on the shared channel. */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatChangePublisher {
    private final KafkaTemplate<String, Object> kafka;
    private final TradeRepository trades;

    public void publishForTrade(UUID tradeId) {
        trades.findById(tradeId).map(Trade::getChatId).ifPresent(this::publish);
    }

    public void publish(UUID chatId) {
        if (chatId == null) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send(chatId);
                }
            });
        } else {
            send(chatId);
        }
    }

    private void send(UUID chatId) {
        try {
            kafka.send("chat.changed.v1", chatId.toString(), Map.of("chatId", chatId))
                    .whenComplete((result, failure) -> {
                        if (failure != null) log.warn("Chat invalidation failed for {}", chatId, failure);
                    });
        } catch (RuntimeException failure) {
            // The financial mutation has committed. A notification failure must
            // not make the caller retry an already-successful command.
            log.warn("Chat invalidation failed for {}", chatId, failure);
        }
    }
}
