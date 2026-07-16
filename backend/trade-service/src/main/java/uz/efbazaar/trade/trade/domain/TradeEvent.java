package uz.efbazaar.trade.trade.domain;

/**
 * Trigger for a state-machine transition. Each event has a fixed set of
 * source states from which it is legal — enforced by {@link
 * uz.efbazaar.trade.trade.service.TradeStateMachine}.
 */
public enum TradeEvent {
    /** Worker replied to email-provision-request. INITIATED → WAITING_PAYMENT. */
    MAILBOX_PROVISIONED,
    /** Buyer clicked "TO'LOV QILDIM". WAITING_PAYMENT → WAITING_EMAIL_CHANGE. */
    PAYMENT_CONFIRMED,
    /** Seller clicked "O'ZGARTIRDIM". WAITING_EMAIL_CHANGE → VERIFYING_KONAMI_LINK. */
    EMAIL_CHANGED,
    /** Worker reported IMAP-matched Konami email. VERIFYING_KONAMI_LINK → WAITING_PASSWORD. */
    KONAMI_EMAIL_RECEIVED,
    /** Seller sent password via one-time flow. WAITING_PASSWORD → WAITING_BUYER_VERIFY. */
    PASSWORD_SENT,
    /** Buyer clicked "TASDIQLAYMAN". WAITING_BUYER_VERIFY → SUCCESS. */
    BUYER_CONFIRM,
    /** Buyer clicked "AKKAUNT NOTO'G'RI". WAITING_BUYER_VERIFY → REJECTED. */
    BUYER_REJECT,
    /** Per-state deadline elapsed. → ORPHANED (or REJECTED for state 6). */
    TIMEOUT,
    /** Seller clicked "QAYTA TEKSHIR" (state 4). Does not change state; used for audit only. */
    RECHECK
}
