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
 * rather than lying about zero unread. Both are also null for a {@code locked}
 * mailbox (over the plan limit): its activity must not leak through the sidebar.
 */
public record MailboxSummary(
        UUID id,
        String email,
        String displayName,
        Integer unreadCount,
        Instant lastActivityAt,
        Instant ownedSince,
        boolean locked,
        uz.efbazaar.trade.plan.service.MailboxAccessService.AccessState accessState,
        Instant paidExpiresAt,
        Instant graceEndsAt,
        boolean selectedForFree
) {
    public MailboxSummary(UUID id, String email, String displayName, Integer unreadCount,
                          Instant lastActivityAt, Instant ownedSince, boolean locked) {
        this(id, email, displayName, unreadCount, lastActivityAt, ownedSince, locked, null, null, null, false);
    }
}
