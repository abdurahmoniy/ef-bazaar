package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.domain.AttachmentType;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MessageResponse(
        UUID id,
        UUID chatId,
        UUID senderId,
        String content,
        AttachmentType attachmentType,
        String attachmentFileId,
        String attachmentName,
        String attachmentMime,
        Long attachmentSize,
        Instant createdAt
) {}
