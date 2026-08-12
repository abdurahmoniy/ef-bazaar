package uz.efbazaar.payment.card.domain;

public enum CardBrand {
    VISA, MC, UZCARD, HUMO;

    /** BIN rules matching the frontend's card-detect.ts. */
    public static CardBrand detect(String pan) {
        if (pan.startsWith("9860")) return HUMO;
        if (pan.startsWith("8600")) return UZCARD;
        if (pan.startsWith("4")) return VISA;
        if (pan.matches("^(5[1-5]|222[1-9]|2[3-6]\\d\\d|27[01]\\d|2720).*")) return MC;
        throw new IllegalArgumentException("Unknown card brand for this BIN");
    }
}
