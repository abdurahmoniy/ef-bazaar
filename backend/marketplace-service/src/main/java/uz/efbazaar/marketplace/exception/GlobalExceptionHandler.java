package uz.efbazaar.marketplace.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onUnknown(Exception ex) {
        log.error("Unhandled exception", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Ichki xatolik", null);
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
