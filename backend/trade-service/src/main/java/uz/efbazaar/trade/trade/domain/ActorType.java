package uz.efbazaar.trade.trade.domain;

public enum ActorType {
    USER, WORKER, SYSTEM,
    /** Platform staff (ROLE_ADMIN) — moderation, escalation. */
    ADMIN,
    /** A hired trade admin (ROLE_TRADE_ADMIN) acting on their own trade. */
    TRADE_ADMIN
}
