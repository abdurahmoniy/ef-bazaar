package uz.efbazaar.marketplace.kafka;

import java.time.Instant;
import java.util.UUID;

/** Mirror of trade-service's {@code efbazaar.trade.account-email-verified} payload. */
public record AccountEmailVerifiedDto(
        UUID sessionId,
        UUID accountId,
        UUID ownerId,
        UUID mailboxId,
        String email,
        boolean custom,
        Instant verifiedAt) {}
