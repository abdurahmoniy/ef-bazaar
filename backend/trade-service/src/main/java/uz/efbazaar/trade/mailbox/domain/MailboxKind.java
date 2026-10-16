package uz.efbazaar.trade.mailbox.domain;

/** Mirrors {@code chk_mailboxes_kind} in {@code V31}. */
public enum MailboxKind {

    /** Escrow or admin-registered box; counts against {@code mailbox.slots}. */
    RANDOM,

    /** Self-named box the user claimed; counts against {@code mailbox.custom_slots}, never used by a trade. */
    CUSTOM
}
