package uz.efbazaar.access.check;

public enum CheckOutcome {
    /** Shart bajarilgan. */
    MET,
    /** Shart bajarilmagan — login rad etiladi. */
    UNMET,
    /** Tekshirib bo'lmadi (bot/Telegram javob bermadi) — shart o'tkazib yuboriladi. */
    UNKNOWN
}
