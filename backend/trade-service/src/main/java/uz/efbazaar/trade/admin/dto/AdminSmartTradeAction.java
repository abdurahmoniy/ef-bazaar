package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.trade.domain.TradeState;

/**
 * The worker-driven steps an admin may complete by hand.
 *
 * <p>Three. Every other worker event carries an encrypted mailbox password
 * minted by the worker, which an admin cannot and must not fabricate — if one
 * of those steps fails, the existing provision-failed path closes the trade.
 */
public enum AdminSmartTradeAction {
    /** WAITING_EMAIL_CHANGE: Konami's code arrived but the worker could not read it. */
    EMAIL_CHANGE_CODE,
    /** VERIFYING_KONAMI_LINK: Konami's verification mail arrived but was not detected. */
    KONAMI_EMAIL_CONFIRM,
    /**
     * WAITING_BUYER_VERIFY: oluvchi akkountga kirmoqchi, Konami kirish kodini
     * pochtaga yubordi, worker esa uni o'qib bera olmadi. Kodsiz oluvchi
     * akkountni ko'ra olmaydi va savdo shu yerda qotib qoladi.
     */
    LOGIN_CODE,
    NONE;

    public static AdminSmartTradeAction forState(TradeState state) {
        return switch (state) {
            case WAITING_EMAIL_CHANGE -> EMAIL_CHANGE_CODE;
            case VERIFYING_KONAMI_LINK -> KONAMI_EMAIL_CONFIRM;
            case WAITING_BUYER_VERIFY -> LOGIN_CODE;
            default -> NONE;
        };
    }
}
