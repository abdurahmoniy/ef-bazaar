package uz.efbazaar.marketplace.account;

/**
 * Akkount nega ro'yxatdan chiqdi.
 *
 * <p>Statusning o'zi buni aytmaydi, keyinchalik esa "bu akkount qayerga
 * ketdi" degan savol aynan qo'llab-quvvatlash yozishmalarida chiqadi.
 */
public enum ArchivedReason {
    SOLD_ON_PLATFORM,
    SOLD_ELSEWHERE,
    BY_OWNER
}
