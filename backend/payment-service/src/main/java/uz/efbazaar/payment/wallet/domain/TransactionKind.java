package uz.efbazaar.payment.wallet.domain;

public enum TransactionKind {
    DEPOSIT,
    TRADE_HOLD,
    TRADE_SETTLE,
    TRADE_RELEASE,
    WITHDRAW_RESERVE,
    WITHDRAW_FULFIL,
    WITHDRAW_CANCEL,
    /** Hamkorlik maqomi uchun bir martalik to'lov. */
    PARTNER_FEE,
    ADJUSTMENT
}
