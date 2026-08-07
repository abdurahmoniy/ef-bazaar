package uz.efbazaar.trade.mailbox.exception;

/** Thrown when an admin registers a local part that is already taken. 409. */
public class MailboxAlreadyExistsException extends RuntimeException {

    public MailboxAlreadyExistsException(String email) {
        super("Mailbox " + email + " already exists");
    }
}
