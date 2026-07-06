package uz.efbazaar.marketplace.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * When true, unhandled 500s include a {@code debug} field with the exception
     * class + message. Enable temporarily via {@code APP_DEBUG_ERRORS=true} to
     * diagnose issues when server logs are unavailable. Keep OFF in real prod —
     * leaks stack info to clients.
     */
    @Value("${app.debug-errors:false}")
    private boolean debugErrors;

    @ExceptionHandler(MarketplaceException.class)
    public ResponseEntity<Map<String, Object>> onMarketplace(MarketplaceException ex) {
        return build(ex.getStatus(), ex.getCode(), ex.getMessage(), null);
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

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthenticationException ex) {
        return build(HttpStatus.UNAUTHORIZED, "unauthorized", "Ruxsat yo'q", null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> onForbidden(AccessDeniedException ex) {
        return build(HttpStatus.FORBIDDEN, "forbidden", "Ruxsat etilmagan", null);
    }

    /**
     * Crawler probes for random paths hit Spring's static resource handler
     * which throws NoResourceFoundException. Route to 404 so it doesn't page
     * us through the log-forwarder as a 500.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> onNotFound(NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "not_found", "Not Found", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onUnknown(Exception ex) {
        log.error("Unhandled exception", ex);
        Object details = null;
        if (debugErrors) {
            Throwable root = ex;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            details = Map.of(
                    "exception", ex.getClass().getName(),
                    "message", String.valueOf(ex.getMessage()),
                    "rootCause", root.getClass().getName(),
                    "rootMessage", String.valueOf(root.getMessage()));
        }
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Ichki xatolik", details);
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
