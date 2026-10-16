package uz.efbazaar.trade.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * A refusal the client branches on by {@code code}.
 *
 * <p>Answered as {@code {status, code, message}}; the message is Uzbek and
 * safe to show, the code is what the screen switches on.
 */
@Getter
public class ApiCodeException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiCodeException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
