package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record SendMessageRequest(
        @NotBlank @Size(min = 1, max = 4000) String content,
        /** Optional Telegram-style quote — must reference a message in the same chat. */
        UUID replyToId
) {}
