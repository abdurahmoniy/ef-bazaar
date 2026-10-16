package uz.efbazaar.trade.mailbox.link;

/** Mirrors {@code chk_link_session_state} in {@code V31}. */
public enum LinkSessionState {
    /** The user is moving the Konami email to the box; the worker relays Konami's code. */
    WAIT_EMAIL_CHANGE,
    /** The user asked Konami for a password reset; the reset mail arriving is the proof. */
    WAIT_RESET,
    VERIFIED,
    EXPIRED,
    CANCELLED;

    public boolean live() {
        return this == WAIT_EMAIL_CHANGE || this == WAIT_RESET;
    }
}
