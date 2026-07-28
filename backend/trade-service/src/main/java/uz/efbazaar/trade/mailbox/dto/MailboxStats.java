package uz.efbazaar.trade.mailbox.dto;

/**
 * Counters behind the admin panel's filter chips. Cheap COUNT queries — the
 * panel refetches them on every list render.
 */
public record MailboxStats(
        long total,
        long trade,
        long admin,
        long pending,
        long unassigned
) {}
