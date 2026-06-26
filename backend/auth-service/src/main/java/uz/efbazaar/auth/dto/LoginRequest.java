package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank
        @Size(max = 255)
        String usernameOrEmail,

        @NotBlank
        @Size(max = 128)
        String password
) {}
