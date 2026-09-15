package uz.efbazaar.access.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import uz.efbazaar.access.requirement.AccessRequirementException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Javob shakli auth-service bilan bir xil: {@code status, code, message}. */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(AccessRequirementException.class)
    public ResponseEntity<Map<String, Object>> onRequirement(AccessRequirementException ex) {
        return build(ex.getStatus(), ex.getCode(), ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> onValidation(MethodArgumentNotValidException ex) {
        return build(HttpStatus.BAD_REQUEST, "validation_failed", "Kiritilgan ma'lumotlar noto'g'ri");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> onTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "bad_request", "So'rov parametri noto'g'ri");
    }

    private static ResponseEntity<Map<String, Object>> build(HttpStatus status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("code", code);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}
