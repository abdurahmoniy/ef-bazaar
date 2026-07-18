package uz.efbazaar.trade.mail.service;

/**
 * Thrown when a caller trips the mail rate limiter. Mapped to a 429 response
 * by the exception handler.
 */
public class RateLimitExceededException extends RuntimeException {
    public RateLimitExceededException(String msg) {
        super(msg);
    }
}
