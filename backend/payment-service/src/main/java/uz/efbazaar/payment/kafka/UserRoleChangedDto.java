package uz.efbazaar.payment.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Local mirror of auth-service's {@code efbazaar.auth.user-role-changed}
 * payload, declared here so the services stay independently deployable. Roles
 * are plain strings so this compiles without auth-service's enum.
 */
public record UserRoleChangedDto(
        UUID userId,
        String oldRole,
        String newRole,
        Instant occurredAt) {

    public static final String ADMIN = "ADMIN";
}
