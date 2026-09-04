package uz.efbazaar.bot.partner;

import java.time.Instant;
import java.util.UUID;

/** Marketplace: "shu kanalni Telegram'dan qayta o'qi". */
public record ChannelRefreshRequest(
        UUID partnerChannelId,
        Long telegramChannelId,
        Instant occurredAt) {}
