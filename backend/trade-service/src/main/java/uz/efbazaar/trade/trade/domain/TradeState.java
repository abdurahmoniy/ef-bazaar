package uz.efbazaar.trade.trade.domain;

import java.util.EnumSet;
import java.util.Set;

public enum TradeState {
    INITIATED,
    WAITING_PAYMENT,
    WAITING_EMAIL_CHANGE,
    VERIFYING_KONAMI_LINK,
    WAITING_PASSWORD,
    WAITING_BUYER_VERIFY,
    /** HUMAN only — waiting for the invited admin to accept. */
    WAITING_ADMIN,
    /** HUMAN only — admin is working the six-step checklist. */
    IN_PROGRESS,
    /** HUMAN only — admin closed; waiting for both parties to confirm. */
    WAITING_CLOSE_CONFIRM,
    SUCCESS,
    REJECTED,
    ORPHANED;

    private static final Set<TradeState> TERMINAL =
            EnumSet.of(SUCCESS, REJECTED, ORPHANED);

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }

    public static Set<TradeState> nonTerminal() {
        return EnumSet.complementOf(EnumSet.copyOf(TERMINAL));
    }
}
