package uz.efbazaar.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.auth.domain.Role;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(
        UUID id,
        String username,
        String email,
        Long telegramId,
        String telegramUsername,
        String telegramFirstName,
        String telegramLastName,
        String telegramPhotoUrl,
        boolean verified,
        Role role,
        Instant createdAt
) {}
