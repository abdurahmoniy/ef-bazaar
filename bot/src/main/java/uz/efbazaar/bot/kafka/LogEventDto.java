package uz.efbazaar.bot.kafka;

import java.time.Instant;

/** Mirrors the {@code LogEvent} record published by each service. */
public record LogEventDto(
        String service,
        String level,
        String logger,
        String thread,
        String message,
        String stackTrace,
        Instant timestamp
) {}
