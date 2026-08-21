package uz.efbazaar.auth.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Published on {@code efbazaar.notifications.mailbox-handed-over} so the bot
 * can DM the party without ever reading auth's database.
 */
public record MailboxHandoverNotificationEvent(
        UUID tradeId,
        UUID userId,
        Long telegramId,
        String mailboxEmail,
        String outcome,
        Instant occurredAt) {}
