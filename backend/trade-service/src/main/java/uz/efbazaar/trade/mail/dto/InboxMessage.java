package uz.efbazaar.trade.mail.dto;

import java.time.Instant;

/**
 * One row in the inbox list. `messageId` is the IMAP UID rendered as a decimal
 * string so it round-trips through path variables without special encoding.
 * `snippet` is the first ~200 chars of the plain body — empty string if the
 * message has only HTML.
 */
public record InboxMessage(
        String messageId,
        String subject,
        String fromName,
        String fromAddress,
        Instant receivedAt,
        String snippet,
        boolean seen,
        boolean hasAttachments,
        boolean criticalRecovery
) {}
