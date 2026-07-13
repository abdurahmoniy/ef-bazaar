package uz.efbazaar.trade.common.exception;

import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import uz.efbazaar.trade.card.exception.CardValidationException;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;
import uz.efbazaar.trade.trade.exception.RateLimitedException;

import java.time.Instant;
import java.util.Map;

/**
 * Global HTTP status mapping for domain exceptions.
 * Keeps the response body opaque — no stack traces, no internal field names.
 */
@Slf4j
@RestControllerAdvice
public class TradeExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(EntityNotFoundException e) {
        log.debug("entity not found: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body(HttpStatus.NOT_FOUND, "not_found"));
    }

    @ExceptionHandler(CardValidationException.class)
    public ResponseEntity<Map<String, Object>> handleCardValidation(CardValidationException e) {
        log.debug("card validation failed: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body(HttpStatus.BAD_REQUEST, "card_invalid"));
    }

    @ExceptionHandler(ProposalNotFoundException.class)
    ResponseEntity<Map<String, Object>> onProposalNotFound(ProposalNotFoundException e) {
        return status(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(InvalidTradeTransitionException.class)
    ResponseEntity<Map<String, Object>> onInvalidTransition(InvalidTradeTransitionException e) {
        return status(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(RateLimitedException.class)
    ResponseEntity<Map<String, Object>> onRateLimit(RateLimitedException e) {
        return status(HttpStatus.TOO_MANY_REQUESTS, e.getMessage());
    }

    private Map<String, Object> body(HttpStatus status, String code) {
        return Map.of(
                "timestamp", Instant.now().toString(),
                "status", status.value(),
                "code", code
        );
    }

    private static ResponseEntity<Map<String, Object>> status(HttpStatus s, String msg) {
        return ResponseEntity.status(s).body(Map.of(
                "status", s.value(),
                "error", s.getReasonPhrase(),
                "message", msg));
    }
}
