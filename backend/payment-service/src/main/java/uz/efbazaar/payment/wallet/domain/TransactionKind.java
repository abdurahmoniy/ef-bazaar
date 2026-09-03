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
    /** Referal mukofoti — platforma foydalanuvchi jalb qilish uchun to'laydi. */
    REFERRAL_REWARD,
    /** Sotuvchining reklama uchun ushlangan mablag'i. */
    PARTNER_POST_HOLD,
    /** Post chiqqach hamkorga o'tkazilishi. */
    PARTNER_POST_SETTLE,
    /** Post chiqmadi — sotuvchiga qaytarish. */
    PARTNER_POST_REFUND,
    /** Kanaldan kelgan savdodan hamkor ulushi. */
    PARTNER_TRADE_SHARE,
    /** Fiks rejimdagi hamkorga oylik to'lov. */
    PARTNER_MONTHLY,
    ADJUSTMENT
}
