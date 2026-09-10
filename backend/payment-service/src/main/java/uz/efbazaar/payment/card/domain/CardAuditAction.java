package uz.efbazaar.payment.card.domain;

public enum CardAuditAction {
    CREATED,
    DEACTIVATED,
    ACTIVATED,
    REORDERED,
    /**
     * The row is gone. The audit trail is deliberately not: {@code
     * platform_card_audit.card_id} carries no foreign key, so this line
     * outlives the card it names and a deleted card still has a history.
     */
    DELETED
}
