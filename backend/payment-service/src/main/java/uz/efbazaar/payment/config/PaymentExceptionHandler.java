package uz.efbazaar.payment.config;

import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class PaymentExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ProblemDetail notFound(EntityNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    /**
     * The detail is logged, not returned. {@code IllegalArgumentException} is
     * raised by the ledger's own invariants as well as by input validation, and
     * "Postings must sum to zero, got -4200 for key invoice-…" is internal
     * accounting language: it tells an HTTP caller nothing it can act on and
     * describes the shape of the ledger to anyone who pokes at the API.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail badRequest(IllegalArgumentException e) {
        log.warn("Rejected as a bad request: {}", e.getMessage(), e);
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "So'rov noto'g'ri");
    }

    /**
     * A losing race on a partial unique index is a conflict, not a 500. Without
     * this the slot allocator's own conflicts and concurrent card creates would
     * surface as server errors.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail conflict(DataIntegrityViolationException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Bir vaqtda o'zgardi");
    }

    @ExceptionHandler(uz.efbazaar.payment.plan.exception.PlanPurchaseException.class)
    public ProblemDetail planPurchase(uz.efbazaar.payment.plan.exception.PlanPurchaseException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(e.getStatus(), e.getMessage());
        pd.setProperty("code", e.getCode());
        e.getExtra().forEach(pd::setProperty);
        return pd;
    }
}
