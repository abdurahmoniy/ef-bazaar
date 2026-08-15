package uz.efbazaar.payment.withdrawal.domain;

public enum WithdrawalStatus {
    /** Money frozen, waiting for an admin to pay it out. One per user. */
    OPEN,
    /** Admin sent the money and closed the ticket; the wallet is debited. */
    PAID,
    /** Admin declined; the frozen money goes back to available. */
    REJECTED
}
