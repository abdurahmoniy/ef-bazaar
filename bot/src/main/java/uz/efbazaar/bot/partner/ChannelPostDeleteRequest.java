package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

/** Marketplace: "shu xabarni kanaldan o'chir" — e'lon qayta yuborildi. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ChannelPostDeleteRequest(
        UUID postId,
        Long telegramChannelId,
        String telegramMessageId,
        Instant occurredAt) {}
