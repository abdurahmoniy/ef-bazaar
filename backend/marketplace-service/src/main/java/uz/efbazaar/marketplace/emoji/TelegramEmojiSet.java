package uz.efbazaar.marketplace.emoji;

import java.util.List;

/**
 * Bot servisidan keladigan to'plam.
 *
 * <p>Bot tarafidagi `EmojiSetView` ning ko'zgusi. Servislar modul bo'lishmaydi
 * — shakl bir xilligi shu ikki fayl mos turishi bilan saqlanadi, xuddi
 * `LogEvent` da bo'lgani kabi.
 */
public record TelegramEmojiSet(String name, String title, List<Item> items) {

    public record Item(String customEmojiId, String emoji, String fileId,
                       String thumbnailFileId, String format) {}
}
