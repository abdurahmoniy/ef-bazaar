package uz.efbazaar.payment.wallet.domain;

public enum TransactionKind {
    DEPOSIT,
    TRADE_HOLD,
    TRADE_SETTLE,
    TRADE_RELEASE,
    WITHDRAW_RESERVE,
    WITHDRAW_FULFIL,
    WITHDRAW_CANCEL,
    ADJUSTMENT
}
