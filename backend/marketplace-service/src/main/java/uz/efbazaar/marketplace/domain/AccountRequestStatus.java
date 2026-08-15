package uz.efbazaar.marketplace.domain;

public enum AccountRequestStatus {
    /** Waiting for the other party to send a proposal. At most one per chat. */
    OPEN,
    /** A trade was opened for this listing. */
    FULFILLED,
    /** Withdrawn, or superseded by a newer request in the same chat. */
    CANCELLED
}
