package uz.efbazaar.payment.plan.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public record AssignPlanRequest(
        @NotNull UUID userId,
        @NotBlank String planCode,
        /** Null keeps it open-ended. */
        Instant expiresAt,
        String source) {}
