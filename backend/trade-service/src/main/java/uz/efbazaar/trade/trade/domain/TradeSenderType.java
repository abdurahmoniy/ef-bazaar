package uz.efbazaar.trade.trade.domain;

public enum TradeSenderType {
    /** A trade participant (seller or buyer, inferred from the owning chat). */
    USER,
    /** Automated smart-admin bot messages (STATE_1…STATE_6 prompts). */
    SMART_ADMIN,
    /** System-injected state transitions (STATUS entries). */
    SYSTEM,
    /** A hired human admin writing into one of the two party chats. */
    HUMAN_ADMIN
}
