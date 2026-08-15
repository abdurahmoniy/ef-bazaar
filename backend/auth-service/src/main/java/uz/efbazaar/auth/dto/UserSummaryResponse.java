package uz.efbazaar.auth.dto;

import uz.efbazaar.auth.domain.User;

import java.time.Instant;
import java.util.UUID;

/**
 * Server-to-server projection of a user for consuming services. Contains the
 * public identity surface only — no tokens, no emails, no photo file ids.
 * {@code photoAvailable} tells the caller whether the {@code /users/me/photo}
 * style proxy would resolve to an actual image.
 */
public record UserSummaryResponse(
        UUID id,
        String displayName,
        String telegramUsername,
        Long telegramId,
        boolean verified,
        Instant createdAt,
        boolean photoAvailable,
        String telegramPhotoUrl
) {
    public static UserSummaryResponse from(User user) {
        String photoUrl = null;
        if (user.getTelegramPhotoFileId() != null && !user.getTelegramPhotoFileId().isBlank()) {
            photoUrl = "/api/auth/v1/users/" + user.getId() + "/photo";
        } else if (user.getTelegramPhotoUrl() != null && !user.getTelegramPhotoUrl().isBlank()) {
            photoUrl = user.getTelegramPhotoUrl();
        }
        return new UserSummaryResponse(
                user.getId(),
                user.displayName(),
                user.getTelegramUsername(),
                user.getTelegramId(),
                user.verified(),
                user.getCreatedAt(),
                user.getTelegramPhotoFileId() != null || user.getTelegramPhotoUrl() != null,
                photoUrl
        );
    }
}
