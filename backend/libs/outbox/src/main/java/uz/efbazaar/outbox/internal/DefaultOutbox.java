package uz.efbazaar.outbox.internal;

import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.outbox.Outbox;

import javax.sql.DataSource;

public class DefaultOutbox implements Outbox {

    private final OutboxRepository repo;
    private final MessageEncoder encoder;
    private final Runnable wake;
    private final DataSource dataSource;

    public DefaultOutbox(OutboxRepository repo, MessageEncoder encoder, Runnable wake, DataSource dataSource) {
        this.repo = repo;
        this.encoder = encoder;
        this.wake = wake;
        this.dataSource = dataSource;
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

    /**
     * Faol tranzaksiya yetarli emas — u AYNAN outbox bazasi ustida bo'lishi kerak. Boshqa
     * DataSource tranzaksiyasi ichida yozuv autocommit bo'lib, biznes o'zgarishidan ajralib qolardi.
     */
    private void requireTransaction(String operation) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.hasResource(dataSource)) {
            throw new IllegalTransactionStateException(
                    "Outbox." + operation + " faqat outbox bazasi ustidagi faol tranzaksiya ichida chaqiriladi");
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
