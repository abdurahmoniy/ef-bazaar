package uz.efbazaar.marketplace.support.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AdminSupportReplyRequest(
        @NotBlank(message = "Xabar matni bo'sh bo'lishi mumkin emas")
        @Size(max = 2000, message = "Xabar 2000 belgidan oshmasligi kerak")
        String content
) {}
