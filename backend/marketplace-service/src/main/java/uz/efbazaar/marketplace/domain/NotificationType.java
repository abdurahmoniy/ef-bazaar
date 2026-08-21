package uz.efbazaar.marketplace.domain;

public enum NotificationType {
    /** A buyer opened a chat on my listing. */
    CHAT_CREATED,
    /** My chat partner sent a message. */
    CHAT_MESSAGE,
    /** Trust: a confirmed complaint (or repeated false reports) → warning. */
    TRUST_WARNING,
    /** Trust: account blocked (temporary or permanent). */
    TRUST_BLOCKED,
    /** Trust: block lifted (expired or revoked). */
    TRUST_UNBLOCKED,
    /** A seller invited me to run their trade as a human trade admin. */
    TRADE_ADMIN_INVITED,
    /** Admin-facing: somebody asked to withdraw and the money is frozen. */
    WITHDRAWAL_REQUESTED,
    /** My payout was sent. */
    WITHDRAWAL_PAID,
    /** My payout was declined and the money is back in my wallet. */
    WITHDRAWAL_REJECTED,
    /** A trade completed and the account I received now sits in my own inbox. */
    TRADE_MAILBOX_RECEIVED,
    /** A trade ended without completing; the inbox I was given is mine to keep. */
    TRADE_MAILBOX_RETURNED
}
