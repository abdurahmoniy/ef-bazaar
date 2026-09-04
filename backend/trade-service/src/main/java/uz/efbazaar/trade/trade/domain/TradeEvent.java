package uz.efbazaar.trade.trade.domain;

/**
 * Trigger for a state-machine transition. Each event has a fixed set of
 * source states from which it is legal — enforced by {@link
 * uz.efbazaar.trade.trade.service.TradeStateMachine}.
 */
public enum TradeEvent {
    /** Worker replied to email-provision-request. INITIATED → WAITING_PAYMENT. */
    MAILBOX_PROVISIONED,
    /**
     * Pochta qutisini ochib bo'lmadi va worker taslim bo'ldi.
     *
     * <p>Usiz INITIATED yagona chiqishsiz holat edi: deadline yo'q,
     * TIMEOUT yo'q, rad etish ham yo'q. Worker uch urinishdan keyin
     * offsetni commit qilib o'tib ketardi va savdo xaridorning puli
     * muzlatilgan holda abadiy qotib qolardi.
     */
    PROVISION_FAILED,
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
    RECHECK,
    /** Invited admin accepted the job. WAITING_ADMIN → IN_PROGRESS. */
    ADMIN_ACCEPTED,
    /** Invited admin refused. WAITING_ADMIN → WAITING_ADMIN (self-loop). */
    ADMIN_DECLINED,
    /** Admin marked all six steps and pressed close. IN_PROGRESS → WAITING_CLOSE_CONFIRM. */
    ADMIN_CLOSED,
    /** Both parties confirmed, or the 24h window elapsed. → SUCCESS. */
    CLOSE_CONFIRMED,
    /** Admin (or a platform admin) aborted — e.g. the account is fake. → REJECTED. */
    ADMIN_CANCELLED
}
