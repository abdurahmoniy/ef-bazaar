package uz.efbazaar.trade.common.exception;

import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import uz.efbazaar.trade.card.exception.CardValidationException;
import uz.efbazaar.trade.mail.service.MessageNotFoundException;
import uz.efbazaar.trade.mail.service.RateLimitExceededException;
import uz.efbazaar.trade.mailbox.exception.MailboxAlreadyExistsException;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.exception.PasswordAlreadyRevealedException;
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

    /**
     * Out of mailbox slots.
     *
     * <p>Answered with the numbers, not just a sentence: there are two ways out
     * — free one up, or move up a tier — and the screen has to offer both
     * without reading prose to work out which.
     */
    @ExceptionHandler(uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException.class)
    ResponseEntity<Map<String, Object>> onSlotsExhausted(
            uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException e) {
        // Built here rather than by adding to body(): that returns Map.of,
        // which throws the moment anything is put into it.
        Map<String, Object> body = new java.util.LinkedHashMap<>(
                body(HttpStatus.CONFLICT, "mailbox_slots_exhausted"));
        body.put("detail", e.getMessage());
        body.put("plan", e.getPlanCode());
        body.put("used", e.getUsed());
        body.put("limit", e.getLimit());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
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

    @ExceptionHandler(PasswordAlreadyRevealedException.class)
    ResponseEntity<Map<String, Object>> onPasswordAlreadyRevealed(PasswordAlreadyRevealedException e) {
        return status(HttpStatus.GONE, "Password already revealed");
    }

    @ExceptionHandler(MessageNotFoundException.class)
    ResponseEntity<Map<String, Object>> onMessageNotFound(MessageNotFoundException e) {
        // 404 without echoing the id — the caller supplied it; leaking it back
        // is fine, but keep the shape identical to other not-found responses.
        log.debug("mail message not found: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body(HttpStatus.NOT_FOUND, "not_found"));
    }

    @ExceptionHandler(RateLimitExceededException.class)
    ResponseEntity<Map<String, Object>> onMailRateLimit(RateLimitExceededException e) {
        return status(HttpStatus.TOO_MANY_REQUESTS, e.getMessage());
    }

    @ExceptionHandler(MailboxAlreadyExistsException.class)
    ResponseEntity<Map<String, Object>> onMailboxExists(MailboxAlreadyExistsException e) {
        return status(HttpStatus.CONFLICT, e.getMessage());
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
