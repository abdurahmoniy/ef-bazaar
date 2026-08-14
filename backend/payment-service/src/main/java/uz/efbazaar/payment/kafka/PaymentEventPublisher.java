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
}
