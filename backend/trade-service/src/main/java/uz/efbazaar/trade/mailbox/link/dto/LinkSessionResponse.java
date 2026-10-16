package uz.efbazaar.trade.mailbox.link.dto;

import java.time.Instant;
import java.util.UUID;

public record LinkSessionResponse(
        UUID id,
        UUID mailboxId,
        String email,
        UUID accountId,
        String state,
        Instant stepDeadline,
        String emailChangeCode,
        boolean notRegistered) {}
