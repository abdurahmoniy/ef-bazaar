package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirrors payment-service's PaymentEventPublisher.WithdrawalRequested. */
public record WithdrawalRequestedDto(
        UUID ticketId,
        UUID userId,
        long amountTiyin,
        String cardLast4,
        Instant occurredAt) {}
