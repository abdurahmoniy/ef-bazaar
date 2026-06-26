package uz.efbazaar.auth.observability;

import java.time.Instant;

/**
 * Forwarded log event payload. Same shape across all services so bot can
 * consume from {@code efbazaar.system.log-event} uniformly.
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
