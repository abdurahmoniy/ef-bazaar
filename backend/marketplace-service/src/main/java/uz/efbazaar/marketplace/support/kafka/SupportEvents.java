package uz.efbazaar.marketplace.support.kafka;

import java.time.Instant;
import java.util.UUID;

public final class SupportEvents {

    private SupportEvents() {}

    public static final String TOPIC_SUPPORT_MESSAGE_CREATED = "efbazaar.marketplace.support-message-created";
    public static final String TOPIC_SUPPORT_MESSAGE_BOUND = "efbazaar.bot.support-message-bound";
    public static final String TOPIC_SUPPORT_REPLY_RECEIVED = "efbazaar.bot.support-reply-received";

    public record SupportMessageCreatedEvent(
            UUID chatId,
            UUID messageId,
            String category,
            UUID userId,
            String senderName,
            String senderContact,
            String content,
            Long replyToTelegramMessageId,
            Instant occurredAt
    ) {}

    public record SupportMessageBoundEvent(
            UUID chatId,
            UUID messageId,
            Long telegramMessageId,
            Instant occurredAt
    ) {}

    public record SupportReplyReceivedEvent(
            Long replyToTelegramMessageId,
            Long telegramMessageId,
            String adminName,
            String adminUsername,
            String text,
            Instant occurredAt
    ) {}
}
