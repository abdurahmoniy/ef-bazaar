package uz.efbazaar.auth.security;

import java.util.List;
import java.util.UUID;

public record AuthenticatedUser(
        UUID userId,
        Long telegramId,
        List<String> roles
) {}
