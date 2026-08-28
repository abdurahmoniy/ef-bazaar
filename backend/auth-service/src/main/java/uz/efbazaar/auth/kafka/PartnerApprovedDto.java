package uz.efbazaar.auth.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

/** {@code efbazaar.marketplace.partner-approved}. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PartnerApprovedDto(UUID applicationId, UUID userId, Instant occurredAt) {}
