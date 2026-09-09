package uz.efbazaar.marketplace.support.dto;

import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChat;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;

import java.time.Instant;
import java.util.UUID;

public record AdminSupportChatSummaryResponse(
        UUID id,
        SupportCategory category,
        SupportChatStatus status,
        UUID userId,
        String guestSessionId,
        String senderName,
        String senderContact,
        Long telegramRootMessageId,
        String lastMessagePreview,
        Instant lastMessageAt,
        Instant createdAt
) {
    public static AdminSupportChatSummaryResponse of(SupportChat chat, String lastMessagePreview) {
        return new AdminSupportChatSummaryResponse(
                chat.getId(),
                chat.getCategory(),
                chat.getStatus(),
                chat.getUserId(),
                chat.getGuestSessionId(),
                chat.getSenderName(),
                chat.getSenderContact(),
                chat.getTelegramRootMessageId(),
                lastMessagePreview,
                chat.getLastMessageAt(),
                chat.getCreatedAt()
        );
    }
}
