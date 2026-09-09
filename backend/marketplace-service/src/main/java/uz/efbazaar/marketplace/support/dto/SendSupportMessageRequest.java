package uz.efbazaar.marketplace.support.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendSupportMessageRequest(
        @NotBlank @Size(max = 2000) String content,
        @Size(max = 64) String guestSessionId
) {}
