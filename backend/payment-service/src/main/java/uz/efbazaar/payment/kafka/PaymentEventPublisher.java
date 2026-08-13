package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class PaymentEventPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public record DepositCredited(UUID userId, long amountTiyin, UUID invoiceId, Instant occurredAt) {}

    public void depositCredited(UUID userId, long amountTiyin, UUID invoiceId) {
        kafka.send(PaymentTopics.DEPOSIT_CREDITED, userId.toString(),
                new DepositCredited(userId, amountTiyin, invoiceId, Instant.now()));
    }
}
