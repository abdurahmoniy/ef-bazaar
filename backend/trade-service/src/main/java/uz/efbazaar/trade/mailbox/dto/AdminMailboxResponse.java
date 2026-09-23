package uz.efbazaar.trade.mailbox.dto;

import uz.efbazaar.trade.mailbox.domain.MailboxSource;

import java.time.Instant;
import java.util.UUID;

/**
 * Admin-panel view of a mailbox: who owns it, when it appeared, and how it got
 * there. Never carries the mailbox password — the admin panel reads mail through
 * the server-side IMAP endpoints, it never hands out credentials.
 *
 * <p>{@code provisionedAt == null} means Mailcow hasn't confirmed the box yet
 * (the worker request is still in flight) — the UI renders that as "pending"
 * and the address shown is the synthetic placeholder.
 */
public record AdminMailboxResponse(
        UUID id,
        String email,
        String displayName,
        UUID ownerUserId,
        UUID tradeId,
        MailboxSource source,
        UUID createdByAdminId,
        Instant createdAt,
        Instant provisionedAt,
        Instant handedOffAt,
        Instant deletedAt
) {}
