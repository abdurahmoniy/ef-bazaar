package uz.efbazaar.trade.security;

import java.util.List;
import java.util.UUID;

/**
 * Identity extracted from the nginx-injected auth headers. Same shape as
 * marketplace-service's AuthenticatedUser so a request that traverses both
 * services is described identically.
 */
public record AuthenticatedUser(
        UUID userId,
        Long telegramId,
        List<String> roles,
        String displayName
) {
    public boolean hasRole(String role) {
        return roles != null && roles.contains(role);
    }
}
