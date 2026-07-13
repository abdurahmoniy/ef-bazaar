package uz.efbazaar.trade.trade.exception;

/**
 * Stub introduced in Task 10 so {@code TradeExceptionHandler} compiles.
 * Fleshed out in Task 12 (rate limiting).
 */
public class RateLimitedException extends RuntimeException {
    public RateLimitedException(String message) {
        super(message);
    }
}
