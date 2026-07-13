package uz.efbazaar.trade.trade.domain;

public enum TradeSenderType {
    /** A trade participant (seller or buyer, inferred from the owning chat). */
    USER,
    /** Automated smart-admin bot messages (STATE_1…STATE_6 prompts). */
    SMART_ADMIN,
    /** System-injected state transitions (STATUS entries). */
    SYSTEM
}
