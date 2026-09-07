package uz.efbazaar.trade.observability;

import java.time.Instant;

/**
 * One forwarded log line, as the bot expects it on
 * {@code efbazaar.system.log-event}. Field-for-field identical to the records
 * of the same name in auth-service and marketplace-service — the services
 * share no module, so the contract is kept by matching the shape.
 */
public record LogEvent(
        String service,
        String level,
        String logger,
        String thread,
        String message,
        String stackTrace,
        Instant timestamp
) {}
