package uz.efbazaar.trade.mailbox.dto;

import java.time.Instant;
import java.util.UUID;

public record MailboxResponse(
        UUID id,
        String email,
        UUID tradeId,
        Instant createdAt,
        Instant handedOffAt,
        boolean locked,
        /** RANDOM or CUSTOM — the frontend matches account emails against this list. */
        uz.efbazaar.trade.mailbox.domain.MailboxKind kind,
        UUID linkedAccountId
) {
    public MailboxResponse withLocked(boolean value) {
        return new MailboxResponse(id, email, tradeId, createdAt, handedOffAt, value, kind, linkedAccountId);
    }
}
