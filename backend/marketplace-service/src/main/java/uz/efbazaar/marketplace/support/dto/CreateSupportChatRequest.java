package uz.efbazaar.marketplace.support.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import uz.efbazaar.marketplace.support.domain.SupportCategory;

public record CreateSupportChatRequest(
        @NotNull SupportCategory category,
        @NotBlank @Size(max = 2000) String message,
        @Size(max = 128) String senderName,
        @Size(max = 128) String senderContact,
        @Size(max = 64) String guestSessionId
) {}
