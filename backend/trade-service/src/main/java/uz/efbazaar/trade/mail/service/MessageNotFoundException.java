package uz.efbazaar.trade.mail.service;

/**
 * Thrown when an IMAP UID / attachment part id doesn't resolve to anything on
 * the server. Mapped to 404 by the controller advice.
 */
public class MessageNotFoundException extends RuntimeException {
    public MessageNotFoundException(String msg) {
        super(msg);
    }
}
