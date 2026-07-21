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
    TRUST_UNBLOCKED
}
