package uz.efbazaar.payment.kafka;

/**
 * A card-credit record this service cannot turn into an observation row.
 *
 * <p>Thrown rather than logged-and-skipped on purpose. Every record on
 * {@code efbazaar.payment.card-credit-observed} is money the platform
 * physically received; dropping one leaves no queue row, no alert and nothing
 * for an admin to reconcile against. Throwing hands it to the error handler,
 * which parks it on the dead-letter topic where it can still be recovered.
 *
 * <p>Registered as non-retryable in {@link KafkaErrorHandlingConfig}: a record
 * missing a NOT NULL field will be missing it on the tenth attempt too.
 */
public class MalformedCardCreditException extends RuntimeException {

    public MalformedCardCreditException(String message) {
        super(message);
    }
}
