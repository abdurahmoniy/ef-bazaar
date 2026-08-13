package uz.efbazaar.payment.observation.domain;

public enum ObservationStatus {
    /** Attributed to exactly one live invoice and credited. */
    MATCHED,
    /** Zero or several candidates — waiting for an admin. Nothing credited. */
    UNMATCHED,
    /** An admin attributed it by hand. */
    MANUALLY_RESOLVED,
    /** A card the platform does not own, or an admin dismissed it. */
    IGNORED
}
