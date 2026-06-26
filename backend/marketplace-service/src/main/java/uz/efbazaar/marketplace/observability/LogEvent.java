package uz.efbazaar.marketplace.observability;

import java.time.Instant;

public record LogEvent(
        String service,
        String level,
        String logger,
        String thread,
        String message,
        String stackTrace,
        Instant timestamp
) {}
