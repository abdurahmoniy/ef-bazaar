package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    /**
     * Publishes without letting a broker outage reach the caller.
     *
     * <p>These are all AFTER_COMMIT publications running on the request thread:
     * the money has already moved and the row is already committed, so throwing
     * here would fail a request whose work succeeded, and there is nothing to
     * roll back anyway. {@code send} still blocks up to {@code max.block.ms}
     * waiting for metadata, which is why that is bounded in application.yml.
     *
     * <p>A dropped event is a real loss — an admin who is never told about a
     * payout. It is logged at error for that reason. Making it survivable needs
     * an outbox, which is a larger change than this.
     */
    private void publish(String topic, String key, Object payload) {
        try {
            kafka.send(topic, key, payload);
        } catch (Exception e) {
            log.error("Could not publish {} for key {}: {}", topic, key, e.toString());
        }
    }

    /** What goes on the wire. */
    public record DepositCredited(UUID userId, long amountTiyin, UUID invoiceId, Instant occurredAt) {}

    /**
     * The in-process request to send one, published inside the crediting
     * transaction and acted on only once that transaction commits.
     */
    public record DepositCreditedSignal(UUID userId, long amountTiyin, UUID invoiceId) {}

    /**
     * {@code AFTER_COMMIT}, the same shape the Telegram notice already used.
     * Sent from inside the transaction, a record announcing a deposit would
     * survive a rollback that undid the deposit itself, and there is no
     * retraction to publish afterwards — a downstream consumer would simply
     * believe money arrived that never did.
     */
    @TransactionalEventListener
    public void onDepositCredited(DepositCreditedSignal signal) {
        depositCredited(signal.userId(), signal.amountTiyin(), signal.invoiceId());
    }

    public void depositCredited(UUID userId, long amountTiyin, UUID invoiceId) {
        publish(PaymentTopics.DEPOSIT_CREDITED, userId.toString(),
                new DepositCredited(userId, amountTiyin, invoiceId, Instant.now()));
    }

    // ----- withdrawals -----

    /** A payout is waiting for whoever is on admin duty. */
    public record WithdrawalRequested(UUID ticketId, UUID userId, long amountTiyin,
                                      String cardLast4, Instant occurredAt) {}

    /**
     * How it ended. {@code paid} rather than a status string so a consumer
     * cannot mistake a refund for a payout by matching the wrong constant.
     */
    public record WithdrawalClosed(UUID ticketId, UUID userId, long amountTiyin,
                                   boolean paid, String note, Instant occurredAt) {}

    public void withdrawalRequested(UUID ticketId, UUID userId, long amountTiyin, String last4) {
        publish(PaymentTopics.WITHDRAWAL_REQUESTED, ticketId.toString(),
                new WithdrawalRequested(ticketId, userId, amountTiyin, last4, Instant.now()));
    }

    public void withdrawalClosed(UUID ticketId, UUID userId, long amountTiyin,
                                 boolean paid, String note) {
        publish(PaymentTopics.WITHDRAWAL_CLOSED, ticketId.toString(),
                new WithdrawalClosed(ticketId, userId, amountTiyin, paid, note, Instant.now()));
    }
}
