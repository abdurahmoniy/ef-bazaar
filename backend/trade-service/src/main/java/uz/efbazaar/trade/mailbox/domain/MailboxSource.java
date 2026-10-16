package uz.efbazaar.trade.mailbox.domain;

/**
 * Where a mailbox row came from. Mirrors the {@code chk_mailboxes_source}
 * CHECK constraint added in {@code V9__add_mailbox_provenance.sql} (extended in {@code V31}).
 */
public enum MailboxSource {

    /** Provisioned by the escrow lifecycle when a trade opened. */
    TRADE,

    /** Registered manually from the admin panel and linked to a user. */
    ADMIN,

    /** Claimed by the user themselves — a custom box. */
    USER
}
