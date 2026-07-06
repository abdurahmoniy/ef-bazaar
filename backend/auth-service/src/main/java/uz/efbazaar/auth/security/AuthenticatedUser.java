package uz.efbazaar.auth.security;

import java.util.List;
import java.util.UUID;

public record AuthenticatedUser(
        UUID userId,
        Long telegramId,
        List<String> roles,
        /** From the token's {@code name} claim; null for pre-claim tokens (≤15 min old). */
        String displayName
) {}
