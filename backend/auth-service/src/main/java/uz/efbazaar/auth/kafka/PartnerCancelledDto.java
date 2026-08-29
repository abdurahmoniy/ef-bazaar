package uz.efbazaar.auth.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

/** {@code efbazaar.marketplace.partner-cancelled}. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PartnerCancelledDto(UUID applicationId, UUID userId, String reason, Instant occurredAt) {}
