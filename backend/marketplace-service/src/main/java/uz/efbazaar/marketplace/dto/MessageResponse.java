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
        /** Quoted message id — null when not a reply or when the quote was deleted. */
        UUID replyToId,
        /** Sender of the quoted message (viewer-side name resolution). */
        UUID replySenderId,
        /** One-line preview of the quoted message. */
        String replyPreview,
        Instant editedAt,
        Instant createdAt
) {}
