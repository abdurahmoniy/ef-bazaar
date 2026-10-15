package uz.efbazaar.payment.plan.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.util.Map;

/** A purchase the rules refuse. {@code code} is for the screen; the message is for the person. */
@Getter
public class PlanPurchaseException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> extra;

    public PlanPurchaseException(HttpStatus status, String code, String message) {
        this(status, code, message, Map.of());
    }

    public PlanPurchaseException(HttpStatus status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}
