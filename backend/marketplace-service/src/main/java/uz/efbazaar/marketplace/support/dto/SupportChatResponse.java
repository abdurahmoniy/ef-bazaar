package uz.efbazaar.marketplace.support.dto;

import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChat;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SupportChatResponse(
        UUID id,
        SupportCategory category,
        SupportChatStatus status,
        String senderName,
        String senderContact,
        List<SupportMessageResponse> messages,
        Instant lastMessageAt,
        Instant createdAt
) {
    public static SupportChatResponse of(SupportChat chat, List<SupportMessageResponse> messages) {
        return new SupportChatResponse(
                chat.getId(),
                chat.getCategory(),
                chat.getStatus(),
                chat.getSenderName(),
                chat.getSenderContact(),
                messages,
                chat.getLastMessageAt(),
                chat.getCreatedAt()
        );
    }
}
