package uz.efbazaar.marketplace.support.dto;

import uz.efbazaar.marketplace.support.domain.SupportMessage;
import uz.efbazaar.marketplace.support.domain.SupportSenderType;

import java.time.Instant;
import java.util.UUID;

public record SupportMessageResponse(
        UUID id,
        UUID supportChatId,
        SupportSenderType senderType,
        String senderName,
        String content,
        Instant createdAt
) {
    public static SupportMessageResponse from(SupportMessage message) {
        return new SupportMessageResponse(
                message.getId(),
                message.getSupportChatId(),
                message.getSenderType(),
                message.getSenderName(),
                message.getContent(),
                message.getCreatedAt()
        );
    }
}
