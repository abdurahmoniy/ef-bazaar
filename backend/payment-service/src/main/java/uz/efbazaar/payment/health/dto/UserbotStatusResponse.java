package uz.efbazaar.payment.health.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserbotStatusResponse(boolean healthy, Instant lastSeenAt, long timeoutSeconds) {}
