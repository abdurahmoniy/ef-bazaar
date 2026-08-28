package uz.efbazaar.bot.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** {@code efbazaar.marketplace.partner-application-submitted}. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PartnerApplicationDto(
        UUID applicationId,
        UUID userId,
        String channelTitle,
        String channelUsername,
        Integer subscriberCount,
        List<Long> adminTelegramIds,
        Instant occurredAt) {}
