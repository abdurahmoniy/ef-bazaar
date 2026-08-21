package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Payload on {@code efbazaar.notifications.mailbox-handed-over}, enriched by
 * auth-service so the bot never reads a Telegram id out of another database.
 */
public record MailboxHandoverDto(
        UUID tradeId,
        UUID userId,
        Long telegramId,
        String mailboxEmail,
        String outcome,
        Instant occurredAt) {}
