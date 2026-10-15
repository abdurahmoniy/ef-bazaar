package uz.efbazaar.trade.mailbox.exception;

/** The mailbox exists and is theirs, but their plan does not let them read it. */
public class MailboxLockedException extends RuntimeException {
    public MailboxLockedException() {
        super("Bu pochta qutisi tarifingiz limitidan tashqarida — tarifingizni oshiring");
    }
}
