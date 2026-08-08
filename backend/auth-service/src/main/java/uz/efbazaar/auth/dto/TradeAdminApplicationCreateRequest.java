package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TradeAdminApplicationCreateRequest(
        @NotBlank @Size(max = 1000) String reason,
        @Size(max = 255) String contact
) {}
