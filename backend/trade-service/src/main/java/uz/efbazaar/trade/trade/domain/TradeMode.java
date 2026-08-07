package uz.efbazaar.trade.trade.domain;

/**
 * Who drives the trade. Decides which side effects {@code TradeStateHandler}
 * fires — see the human trade-admin spec §3.1.
 */
public enum TradeMode {
    /** smart-admin-worker automates Konami and IMAP. */
    SMART,
    /** A hired human runs the trade; Konami/IMAP automation is off. */
    HUMAN
}
