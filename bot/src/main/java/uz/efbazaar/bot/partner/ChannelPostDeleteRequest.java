package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.UUID;

/**
 * Marketplace: "shu xabarni kanaldan o'chir".
 *
 * <p>Ikki holatda keladi: e'lon qayta yuborilgani uchun eskisini olib
 * tashlash, va e'lon butunlay olib tashlangani uchun kanallardagi
 * nusxalarini yo'q qilish.
 *
 * @param telegramChannelId hamkor kanalining raqamli identifikatori. Rasmiy
 *                          kanal uchun null bo'ladi — u sozlamada matn bo'lib
 *                          turadi va {@code @username} ham bo'lishi mumkin.
 * @param chatId            aslida ishlatiladigan qiymat. Eski marketplace
 *                          versiyalari uni yubormaydi, shuning uchun
 *                          {@link #chatOrChannel()} ikkalasini ham qoplaydi.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ChannelPostDeleteRequest(
        UUID postId,
        Long telegramChannelId,
        String chatId,
        String telegramMessageId,
        Instant occurredAt) {

    /** Xabar qayerdan o'chiriladi, yoki null — ikkalasi ham bo'sh bo'lsa. */
    public String chatOrChannel() {
        if (chatId != null && !chatId.isBlank()) return chatId.trim();
        return telegramChannelId == null ? null : String.valueOf(telegramChannelId);
    }
}
