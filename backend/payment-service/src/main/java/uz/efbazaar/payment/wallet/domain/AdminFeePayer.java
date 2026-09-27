package uz.efbazaar.payment.wallet.domain;

/** Stable trade roles, independent of who sent the proposal. */
public enum AdminFeePayer {
    SELLER, BUYER, SPLIT;

    /** An indivisible tiyin belongs to the buyer's half. */
    public long sellerShare(long fee) {
        return switch (this) { case SELLER -> fee; case BUYER -> 0; case SPLIT -> fee / 2; };
    }
}
