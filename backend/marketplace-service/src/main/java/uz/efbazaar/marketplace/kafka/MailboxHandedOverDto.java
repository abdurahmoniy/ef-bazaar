package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirror of trade-service's {@code efbazaar.trade.mailbox-handed-over} payload. */
public record MailboxHandedOverDto(
        UUID tradeId,
        UUID userId,
        String mailboxEmail,
        String outcome,
        Instant occurredAt) {}
