package uz.efbazaar.marketplace.security;

import java.util.List;
import java.util.UUID;

public record AuthenticatedUser(
        UUID userId,
        Long telegramId,
        List<String> roles,
        /** Verified display name from auth (X-User-Name header); null on pre-claim tokens. */
        String displayName
) {
    public AuthenticatedUser(UUID userId, Long telegramId, List<String> roles) {
        this(userId, telegramId, roles, null);
    }
}
