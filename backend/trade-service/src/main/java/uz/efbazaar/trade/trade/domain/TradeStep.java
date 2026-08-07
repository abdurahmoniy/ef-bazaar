package uz.efbazaar.trade.trade.domain;

/**
 * The six things a human admin confirms by hand. Order is not enforced —
 * payment can be collected before or after the account is verified.
 */
public enum TradeStep {
    SELLER_BRIEFED("Sotuvchi bilan gaplashdim"),
    ACCOUNT_TRANSFERRED("Akkount escrow emailga o'tkazildi"),
    ACCOUNT_VERIFIED("Akkountni tekshirdim — haqiqiy"),
    PAYMENT_RECEIVED("Xaridordan to'lovni oldim"),
    CREDENTIALS_DELIVERED("Xaridorga email va parol berildi"),
    SELLER_PAID("Sotuvchiga pulni o'tkazdim");

    private final String labelUz;

    TradeStep(String labelUz) {
        this.labelUz = labelUz;
    }

    /** Shown in both chats and in the admin workspace checklist. */
    public String labelUz() {
        return labelUz;
    }
}
