package uz.efbazaar.bot.kafka;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

/**
 * Hamkorlik bo'yicha qaror hodisalari.
 *
 * <p>{@code recipientTelegramId} — arizachining o'zi. Bot foydalanuvchi
 * identifikatorlarini bilmaydi va auth-service'ga murojaat qila
 * olmaydi, shuning uchun manzilni marketplace yechib beradi.
 */
public final class PartnerDecisionDtos {

    private PartnerDecisionDtos() {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PartnerApproved(
            UUID applicationId,
            UUID userId,
            Long recipientTelegramId,
            Instant occurredAt) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PartnerRejected(
            UUID applicationId,
            UUID userId,
            String note,
            Long recipientTelegramId,
            Instant occurredAt) {}

    /** {@code bySelf} — hamkorning o'zi to'xtatdi; unda xabar yuborilmaydi. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PartnerCancelled(
            UUID applicationId,
            UUID userId,
            String reason,
            boolean bySelf,
            Long recipientTelegramId,
            Instant occurredAt) {}
}
