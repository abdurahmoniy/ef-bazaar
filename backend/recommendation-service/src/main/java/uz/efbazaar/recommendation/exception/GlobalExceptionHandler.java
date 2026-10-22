package uz.efbazaar.recommendation.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Javob shakli marketplace {@code GlobalExceptionHandler} bilan bir xil. */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @Value("${app.debug-errors:false}")
    private boolean debugErrors;

    @ExceptionHandler(RecommendationException.class)
    public ResponseEntity<Map<String, Object>> onRecommendation(RecommendationException ex) {
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

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> onMissingParameter(MissingServletRequestParameterException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request",
                "So'rov parametri yetishmaydi: " + ex.getParameterName(), null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> onTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request", "So'rov parametri noto'g'ri", null);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> onUnreadable(HttpMessageNotReadableException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request", "So'rov tanasi noto'g'ri", null);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> onAuth(AuthenticationException ex) {
        return build(HttpStatus.UNAUTHORIZED, "unauthorized", "Ruxsat yo'q", null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> onForbidden(AccessDeniedException ex) {
        return build(HttpStatus.FORBIDDEN, "forbidden", "Ruxsat etilmagan", null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> onNotFound(NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "not_found", "Not Found", null);
    }

    /**
     * The client went away (closed the page, cancelled the request, lost the
     * network) before the response was written. Nothing failed on our side and
     * there is nobody left to answer, so it is not worth an error alert.
     */
    @ExceptionHandler(org.springframework.web.context.request.async.AsyncRequestNotUsableException.class)
    void onClientGone(org.springframework.web.context.request.async.AsyncRequestNotUsableException ex) {
        log.debug("Client went away before the response was written: {}", ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onUnknown(Exception ex) {
        Throwable root = ex;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        // Root cause birinchi qatorda — Telegram log forwarder uzun stack'ni kesadi.
        log.error("Unhandled exception: {} | root cause: {}: {}",
                ex.toString(), root.getClass().getSimpleName(), root.getMessage(), ex);
        Object details = debugErrors
                ? Map.of("exception", ex.getClass().getName(),
                         "message", String.valueOf(ex.getMessage()),
                         "rootCause", root.getClass().getName(),
                         "rootMessage", String.valueOf(root.getMessage()))
                : null;
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Ichki xatolik", details);
    }

    private static ResponseEntity<Map<String, Object>> build(HttpStatus status, String code,
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
