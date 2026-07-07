package uz.efbazaar.auth.exception;

import io.jsonwebtoken.JwtException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthException ex) {
        return build(ex.getStatus(), ex.getCode(), ex.getMessage(), null);
    }

    @ExceptionHandler(JwtException.class)
    public ResponseEntity<Map<String, Object>> onJwt(JwtException ex) {
        log.debug("JWT error: {}", ex.getMessage());
        return build(HttpStatus.UNAUTHORIZED, "invalid_token",
                "Token noto'g'ri yoki muddati o'tgan", null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> onValidation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> details = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of(
                        "field", fe.getField(),
                        "message", fe.getDefaultMessage() == null ? "" : fe.getDefaultMessage()))
                .toList();
        return build(HttpStatus.BAD_REQUEST, "validation_failed",
                "Kiritilgan ma'lumotlar noto'g'ri", details);
    }

    /**
     * Unknown paths (crawler probes for /swagger-ui/random, /wp-admin, etc.)
     * hit Spring's static resource handler which throws NoResourceFoundException.
     * The generic Exception handler would turn that into a 500 and page us via
     * the log-forwarding pipeline; a 404 is the correct semantic and stops the
     * noise.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> onNotFound(NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "not_found", "Not Found", null);
    }

    /**
     * Partial UUIDs / bad number formats in path variables. Browser URL
     * autocomplete tends to fire SSR fetches mid-typing (…/users/4cd952dc-),
     * or a broken link sends a truncated id. Correct answer is 400, not 500.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> onTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request",
                "So'rov parametri noto'g'ri", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onUnknown(Exception ex) {
        log.error("Unhandled exception", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error",
                "Ichki xatolik", null);
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String code,
                                                      String message, Object details) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("code", code);
        body.put("message", message);
        if (details != null) body.put("details", details);
        return ResponseEntity.status(status).body(body);
    }
}
