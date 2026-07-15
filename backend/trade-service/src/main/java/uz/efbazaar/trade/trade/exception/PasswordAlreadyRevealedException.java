package uz.efbazaar.trade.trade.exception;

/**
 * Thrown when a PASSWORD_ONETIME reveal is attempted after the Redis key has
 * already been consumed (either a prior successful reveal, or TTL expiry).
 * Mapped to 410 Gone — the resource existed but is no longer retrievable.
 */
public class PasswordAlreadyRevealedException extends RuntimeException {
    public PasswordAlreadyRevealedException(String message) {
        super(message);
    }
}
