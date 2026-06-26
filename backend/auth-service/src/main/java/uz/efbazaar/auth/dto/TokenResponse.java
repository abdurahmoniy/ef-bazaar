package uz.efbazaar.auth.dto;

public record TokenResponse(
        String accessToken,
        String refreshToken,
        long accessExpiresInSeconds,
        long refreshExpiresInSeconds,
        UserResponse user
) {}
