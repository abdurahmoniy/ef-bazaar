package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirrors payment-service's PaymentEventPublisher.WithdrawalClosed. */
public record WithdrawalClosedDto(
        UUID ticketId,
        UUID userId,
        long amountTiyin,
        boolean paid,
        String note,
        Instant occurredAt) {}
