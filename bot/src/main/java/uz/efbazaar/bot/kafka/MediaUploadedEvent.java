package uz.efbazaar.bot.kafka;

import java.time.Instant;
import java.util.UUID;

/**
 * Published once per photo after the bot uploads media into the Telegram media
 * topic on behalf of marketplace-service.
 *
 * <p>Contract mirrors CLAUDE.md: {@code { listingId, telegramMessageId, mediaType }}
 * with an {@code occurredAt} timestamp added for downstream ordering.
 *
 * <p>{@code accountId} — rasm qaysi AKKOUNTNIKI. Akkount doimiy, e'lon esa
 * vaqtinchalik: u sotiladi, o'chiriladi va qayta ochiladi, rasmlar esa
 * akkount bilan qoladi. Shuning uchun uzoq muddatli bog'lanish shu maydonda.
 *
 * <p>Ikkala id ham nullable: e'lon oqimi akkountni yuklash paytida hali
 * bilmaydi (akkount e'lon saqlangandan keyin ochiladi), akkount oqimida esa
 * e'lon umuman bo'lmasligi mumkin.
 */
public record MediaUploadedEvent(
        UUID listingId,
        UUID accountId,
        Integer telegramMessageId,
        String mediaType,
        Instant occurredAt
) {}
