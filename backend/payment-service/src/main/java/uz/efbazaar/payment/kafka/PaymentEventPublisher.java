package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class PaymentEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

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
        kafka.send(PaymentTopics.DEPOSIT_CREDITED, userId.toString(),
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
        kafka.send(PaymentTopics.WITHDRAWAL_REQUESTED, ticketId.toString(),
                new WithdrawalRequested(ticketId, userId, amountTiyin, last4, Instant.now()));
    }

    public void withdrawalClosed(UUID ticketId, UUID userId, long amountTiyin,
                                 boolean paid, String note) {
        kafka.send(PaymentTopics.WITHDRAWAL_CLOSED, ticketId.toString(),
                new WithdrawalClosed(ticketId, userId, amountTiyin, paid, note, Instant.now()));
    }
}
