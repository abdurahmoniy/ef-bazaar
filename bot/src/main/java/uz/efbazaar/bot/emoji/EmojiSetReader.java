package uz.efbazaar.bot.emoji;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** `getStickerSet` javobini {@link EmojiSetView} ga o'giradi. */
@Component
public class EmojiSetReader {

    public EmojiSetView read(JsonNode result) {
        List<EmojiSetView.Item> items = new ArrayList<>();
        for (JsonNode s : result.path("stickers")) {
            String id = s.path("custom_emoji_id").asText("");
            // Oddiy stikerda bu maydon yo'q va uni matn ichiga qo'yib
            // bo'lmaydi — panelda bosilganda hech narsa qo'yilmaydigan
            // katak bo'lib qolardi.
            if (id.isEmpty()) continue;

            String fileId = s.path("file_id").asText("");
            String thumb = s.path("thumbnail").path("file_id").asText("");
            items.add(new EmojiSetView.Item(
                    id,
                    s.path("emoji").asText(""),
                    fileId,
                    // Thumbnail'siz statik emoji baribir rasm — o'zini
                    // ko'rsatamiz, aks holda panelda teshik qolardi.
                    thumb.isEmpty() ? fileId : thumb,
                    formatOf(s)));
        }
        return new EmojiSetView(
                result.path("name").asText(""),
                result.path("title").asText(""),
                items);
    }

    /** Brauzer uchalasini boshqacha chizadi, shuning uchun bu farq saqlanadi. */
    private static String formatOf(JsonNode sticker) {
        if (sticker.path("is_video").asBoolean(false)) return "video";     // .webm
        if (sticker.path("is_animated").asBoolean(false)) return "animated"; // .tgs
        return "static";                                                   // .webp
    }
}
