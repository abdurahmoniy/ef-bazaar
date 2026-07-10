package uz.efbazaar.trade.mailbox.dto;

import java.time.Instant;
import java.util.UUID;

public record MailboxResponse(
        UUID id,
        String email,
        UUID tradeId,
        Instant createdAt,
        Instant handedOffAt
) {
}
