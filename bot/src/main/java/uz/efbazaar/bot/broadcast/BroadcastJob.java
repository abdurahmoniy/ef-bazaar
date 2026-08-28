package uz.efbazaar.bot.broadcast;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.UUID;

/** marketplace-service topshiradigan jo'natish vazifasi. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record BroadcastJob(
        UUID broadcastId,
        String messageText,
        String bannerFileId,
        List<List<Button>> buttons,
        Audience audience,
        /** Faqat {@link Audience#SELECTED} uchun to'ldiriladi. */
        List<Long> recipientTelegramIds
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Button(String text, String url) {}

    /**
     * Kimga yuborilsin. Bot rollar haqida hech narsa bilmaydi — bu qiymatni
     * auth-service'ga uzatadi va tayyor manzillar ro'yxatini oladi.
     */
    public enum Audience { ALL, USERS, ADMINS, SELECTED }
}
