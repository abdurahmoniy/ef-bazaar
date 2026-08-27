package uz.efbazaar.bot.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

/** {@code efbazaar.marketplace.bot-settings-updated} — signal, matn emas. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record BotSettingsUpdatedDto(UUID updatedBy, Instant occurredAt) {}
