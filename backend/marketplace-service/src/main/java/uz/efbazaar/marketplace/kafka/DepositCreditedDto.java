package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * payment-service's {@code deposit-credited}, as this service reads it.
 *
 * <p>A local copy of the producer's record rather than a shared class: the two
 * services deploy independently, and a field added on one side must not stop
 * the other from deserializing.
 *
 * @param invoiceId null when an admin attributed the payment by hand. Not a
 *                  malformed record — that path is a deposit too.
 * @param transactionId the ledger transaction, and the dedupe key.
 */
public record DepositCreditedDto(
        UUID userId,
        Long amountTiyin,
        UUID invoiceId,
        UUID transactionId,
        Long balanceAfterTiyin,
        Instant occurredAt) {}
