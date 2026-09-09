package uz.efbazaar.marketplace.support.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SupportAdminReplyRequest(
        @NotNull Long replyToTelegramMessageId,
        Long telegramMessageId,
        String adminName,
        String adminUsername,
        @NotBlank String text
) {}
