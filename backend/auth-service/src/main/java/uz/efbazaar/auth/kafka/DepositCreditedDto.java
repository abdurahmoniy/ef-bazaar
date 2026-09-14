package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * payment-service's {@code deposit-credited}, as this service reads it.
 *
 * <p>A local copy of the producer's record: the two services deploy
 * independently, and a field added on one side must not stop the other
 * deserializing.
 *
 * @param invoiceId null when an admin attributed the payment by hand.
 */
public record DepositCreditedDto(
        UUID userId,
        Long amountTiyin,
        UUID invoiceId,
        UUID transactionId,
        Long balanceAfterTiyin,
        Instant occurredAt) {}
