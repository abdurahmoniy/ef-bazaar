package uz.efbazaar.bot.emoji;

import java.util.List;

/**
 * Bitta emoji to'plami — marketplace saqlaydigan va frontend chizadigan shakl.
 *
 * <p>Telegram javobining hammasi emas, faqat kerakli qismi: id, zaxira emoji,
 * fayl va thumbnail. Butun javobni uzatish keraksiz maydonlarni bazaga
 * ko'chirardi va Telegram ularni o'zgartirganda bizni sindirardi.
 */
public record EmojiSetView(String name, String title, List<Item> items) {

    /**
     * @param customEmojiId  matnga qo'yiladigan id — `<tg-emoji emoji-id="...">`
     * @param emoji          zaxira: custom emoji ko'rsatib bo'lmasa shu chiqadi
     * @param fileId         asl fayl — preview'da harakatlanib ko'rinadigani
     * @param thumbnailFileId panel uchun statik variant
     * @param format         video | animated | static
     */
    public record Item(String customEmojiId, String emoji, String fileId,
                       String thumbnailFileId, String format) {}
}
