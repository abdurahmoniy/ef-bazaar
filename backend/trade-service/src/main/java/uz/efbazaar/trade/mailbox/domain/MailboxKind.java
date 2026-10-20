package uz.efbazaar.trade.mailbox.domain;

/** Mirrors {@code chk_mailboxes_kind} in {@code V31}. */
public enum MailboxKind {

    /** Random escrow address; counts against {@code mailbox.total_slots}. */
    RANDOM,

    /** Named address; shares the total pool and has a creation sublimit. Never used by a trade. */
    CUSTOM
}
