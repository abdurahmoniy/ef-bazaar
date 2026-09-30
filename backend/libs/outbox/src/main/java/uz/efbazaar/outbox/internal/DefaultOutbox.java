package uz.efbazaar.outbox.internal;

import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.outbox.Outbox;

public class DefaultOutbox implements Outbox {

    private final OutboxRepository repo;
    private final MessageEncoder encoder;
    private final Runnable wake;

    public DefaultOutbox(OutboxRepository repo, MessageEncoder encoder, Runnable wake) {
        this.repo = repo;
        this.encoder = encoder;
        this.wake = wake;
    }

    @Override
    public void publish(String topic, String key, Object payload) {
        requireTransaction("publish");
        EncodedMessage message = encoder.encode(topic, payload);
        repo.insert(topic, key, message.payload(), message.headersJson());
        wakeAfterCommit();
    }

    @Override
    public void markSnapshot(String source, String entityId) {
        requireTransaction("markSnapshot");
        repo.mark(source, entityId);
        wakeAfterCommit();
    }

    private static void requireTransaction(String operation) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalTransactionStateException(
                    "Outbox." + operation + " faqat faol tranzaksiya ichida chaqiriladi");
        }
    }

    private void wakeAfterCommit() {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                wake.run();
            }
        });
    }
}
