package uz.efbazaar.marketplace.domain;

public enum ListingStatus {
    ACTIVE,
    SOLD,
    DELETED,
    /**
     * Hidden because the seller is blacklisted. Reversible: un-blacklisting
     * restores BLOCKED → ACTIVE. Public queries must never surface this
     * status (browse filters to ACTIVE/SOLD explicitly).
     */
    BLOCKED
}
