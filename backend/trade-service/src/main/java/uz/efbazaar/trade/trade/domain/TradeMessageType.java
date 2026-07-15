package uz.efbazaar.trade.trade.domain;

public enum TradeMessageType {
    /** Free-form user or smart-admin text; body encrypted with derivable HKDF context. */
    TEXT,
    /** Smart-admin prompt that renders a button on the client; body may be null. */
    BUTTON_PROMPT,
    /** Status change note; body may be null (metadata carries the state code). */
    STATUS,
    /** Konami password one-time reveal; body encrypted with a Redis-held key. */
    PASSWORD_ONETIME
}
