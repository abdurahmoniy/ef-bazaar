package uz.efbazaar.trade.mail.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Sidebar row for the mail account switcher. Extends the raw
 * {@link uz.efbazaar.trade.mailbox.dto.MailboxResponse} shape with the
 * live-from-IMAP counters the Gmail-style UI needs (unread badge, last-activity
 * timestamp).
 *
 * <p>{@code unreadCount} / {@code lastActivityAt} can be null when IMAP is
 * transiently unreachable — the frontend should render "—" in that case
 * rather than lying about zero unread.
 */
public record MailboxSummary(
        UUID id,
        String email,
        Integer unreadCount,
        Instant lastActivityAt,
        Instant ownedSince
) {}
