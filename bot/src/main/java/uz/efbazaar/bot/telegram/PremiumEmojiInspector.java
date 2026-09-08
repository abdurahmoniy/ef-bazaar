package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * `/premium-emoji` — custom emoji'ning `custom_emoji_id` sini aytadi.
 *
 * <p>Id boshqa yo'l bilan qo'lga kirmaydi: u faqat kelgan xabarning
 * `entities` massivida bo'ladi, ya'ni uni ko'rish uchun kimdir update JSON'ini
 * qo'lda o'qishi kerak edi. Emoji'ni shu botga yuborishning o'zi yetsa,
 * postlarga qo'yish uchun id'ni topish bir soniyalik ish bo'ladi.
 *
 * <p>Javobda id bilan birga tayyor HTML ham beriladi — id yolg'iz o'zi
 * foydasiz, uni qanday yozishni ham eslash kerak bo'lardi.
 *
 * <p>ESLATMA: bu asbob id'ni topadi, lekin botning o'zi custom emoji
 * yubora olishini kafolatlamaydi. Telegram buni faqat Fragment'da username
 * sotib olgan botlarga, yoki bot egasi Premium bo'lsa SHAXSIY CHAT, GURUH va
 * SUPERGURUHGA yuborilgan xabarlarga ruxsat beradi — kanal bu ro'yxatda yo'q.
 */
@Component
public class PremiumEmojiInspector {

    /** Bir xabardan nechta emoji o'qiymiz — javob Telegram chegarasiga sig'sin. */
    private static final int MAX_REPORTED = 20;

    public String describe(JsonNode message) {
        List<Found> found = readFrom(message);
        if (found.isEmpty()) {
            // Javob berilgan xabar ko'pincha qulayroq: tayyor postni qayta
            // yozib chiqmaslik uchun unga javoban buyruq yoziladi.
            found = readFrom(message.path("reply_to_message"));
        }
        if (found.isEmpty()) {
            return """
                    <b>Premium emoji id</b>

                    Custom emoji topilmadi. Ikki yo'l bor:

                    • <code>/premium-emoji</code> dan keyin emoji'ni qo'ying
                    • yoki emoji bor xabarga <b>javob</b> qilib <code>/premium-emoji</code> yozing

                    Emoji Premium (custom) bo'lishi shart — oddiy emoji'da id bo'lmaydi.""";
        }

        StringBuilder sb = new StringBuilder("<b>Premium emoji</b>\n");
        for (Found f : found) {
            sb.append('\n').append(f.emoji()).append('\n')
              .append("<code>").append(escape(f.id())).append("</code>\n")
              .append("<code>").append(escape(snippet(f))).append("</code>\n");
        }
        return sb.toString();
    }

    /** Postga to'g'ridan-to'g'ri qo'yiladigan shakl. */
    private static String snippet(Found f) {
        return "<tg-emoji emoji-id=\"" + f.id() + "\">" + f.emoji() + "</tg-emoji>";
    }

    private static List<Found> readFrom(JsonNode message) {
        List<Found> out = new ArrayList<>();
        if (message.isMissingNode()) return out;
        // Rasm/video izohida matn `caption` da, `text` da emas.
        String text = message.hasNonNull("text")
                ? message.path("text").asText()
                : message.path("caption").asText("");
        JsonNode entities = message.hasNonNull("entities")
                ? message.path("entities")
                : message.path("caption_entities");

        for (JsonNode e : entities) {
            if (!"custom_emoji".equals(e.path("type").asText())) continue;
            String id = e.path("custom_emoji_id").asText("");
            if (id.isEmpty()) continue;
            out.add(new Found(id, slice(text, e.path("offset").asInt(), e.path("length").asInt())));
            if (out.size() >= MAX_REPORTED) break;
        }
        return out;
    }

    /**
     * Telegram offset va length'ni UTF-16 code unit'da beradi.
     *
     * <p>Java satri ham UTF-16, shuning uchun `substring` to'g'ri ishlaydi va
     * qo'shimcha hisob kerak emas. Code point bo'yicha kesish esa noto'g'ri
     * bo'lardi: matnda oldin turgan har bir BMP tashqarisidagi belgi (masalan
     * 🎮) ikkita code unit egallaydi va emoji o'rniga yarim belgi olinardi.
     */
    private static String slice(String text, int offset, int length) {
        if (offset < 0 || length <= 0 || offset >= text.length()) return "";
        return text.substring(offset, Math.min(offset + length, text.length()));
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private record Found(String id, String emoji) {}
}
