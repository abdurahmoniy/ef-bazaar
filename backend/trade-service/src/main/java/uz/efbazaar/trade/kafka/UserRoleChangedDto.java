package uz.efbazaar.trade.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Local mirror of auth-service's {@code efbazaar.auth.user-role-changed}
 * payload. Declared here rather than shared, matching how marketplace-service
 * declares its own DTOs for trade-service topics — services stay
 * independently deployable.
 *
 * <p>Roles are plain strings so this compiles without auth-service's enum.
 */
public record UserRoleChangedDto(
        UUID userId,
        String oldRole,
        String newRole,
        Instant occurredAt) {

    public static final String TRADE_ADMIN = "TRADE_ADMIN";

    public boolean grantsTradeAdmin() {
        return TRADE_ADMIN.equals(newRole);
    }
}
