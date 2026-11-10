package uz.efbazaar.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(
        UUID id,
        Long telegramId,
        String telegramUsername,
        String telegramFirstName,
        String telegramLastName,
        String telegramPhotoUrl,
        String displayName,
        String email,
        boolean telegramLinked,
        boolean googleLinked,
        boolean verified,
        List<String> roles,
        Instant createdAt,
        String termsVersion,
        Instant termsAcceptedAt
) {}
