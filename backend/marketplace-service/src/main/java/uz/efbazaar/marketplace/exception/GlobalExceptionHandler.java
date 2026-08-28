package uz.efbazaar.marketplace.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.server.ResponseStatusException;
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

    /**
     * Partial UUIDs / bad number formats in path variables come from crawlers,
     * browser URL autocomplete firing SSR fetches mid-typing (…/listings/4cd952dc-),
     * or malformed client links. The correct response is 400, not 500 — and it
     * keeps the health topic quiet.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> onTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request",
                "So'rov parametri noto'g'ri", null);
    }

    /**
     * Kod ataylab qaytargan HTTP holati.
     *
     * <p>BUSIZ HAR BIRI 500 BO'LARDI. {@code ResponseStatusException} uchun
     * handler bo'lmagani uchun u {@code Exception.class} ga tushib, mijozga
     * "Ichki xatolik" qaytardi va Telegramga ERROR sifatida ketdi. Ya'ni
     * servis ichida yozilgan har bir aniq xabar — "Matn 1200 belgi",
     * "Hamyonda mablag' yetarli emas", "Bitta jo'natma ketayapti" — mijozga
     * yetib bormay, o'rniga umumiy matn ko'rsatilgan.
     *
     * <p>Foydalanuvchi sababli chiqqan 4xx WARN sifatida yoziladi: u
     * nosozlik emas va ERROR bo'lib Telegram kanalini to'ldirmasligi kerak.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> onStatus(ResponseStatusException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        if (status == null) status = HttpStatus.INTERNAL_SERVER_ERROR;

        String message = ex.getReason() == null ? status.getReasonPhrase() : ex.getReason();
        if (status.is5xxServerError()) {
            log.error("{} {}", status.value(), message, ex);
        } else {
            log.warn("{} {}", status.value(), message);
        }
        return build(status, status.name().toLowerCase(java.util.Locale.ROOT), message, null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onUnknown(Exception ex) {
        // Root cause on the first line: the Telegram log forwarder truncates
        // long stack traces, and for wrapped exceptions (SQL, IO) everything
        // that identifies the actual failure lives at the bottom.
        log.error("Unhandled exception: {} | root cause: {}", ex.toString(), rootCauseOf(ex), ex);
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

    private static String rootCauseOf(Throwable ex) {
        Throwable root = ex;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName() + ": " + root.getMessage();
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
