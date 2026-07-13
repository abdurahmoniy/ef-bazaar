package uz.efbazaar.marketplace.domain;

public enum ChatMessageType {
    /** Human-typed message body. */
    TEXT,
    /** System message inserted by trade-service Kafka consumer — carries an in-app CTA. */
    TRADE_PROPOSAL
}
