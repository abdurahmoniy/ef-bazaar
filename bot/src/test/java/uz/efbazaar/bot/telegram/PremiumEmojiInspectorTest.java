package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * `/emoji` — custom emoji'ning id'sini olish uchun kichik asbob.
 *
 * <p>Id'ni boshqa yo'l bilan olish noqulay: u faqat kelgan xabarning
 * `entities` massivida bo'ladi va uni ko'rish uchun update'ni qo'lda o'qish
 * kerak. Bot egasi Premium bo'lsa, emoji'ni shu botga yuborishning o'zi
 * yetadi.
 */
class PremiumEmojiInspectorTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final PremiumEmojiInspector inspector = new PremiumEmojiInspector();

    private JsonNode message(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    @DisplayName("bitta custom emoji uchun id va tayyor HTML qaytaradi")
    void readsASingleCustomEmoji() {
        JsonNode msg = message("""
                {"text":"/emoji 👍",
                 "entities":[
                   {"type":"bot_command","offset":0,"length":6},
                   {"type":"custom_emoji","offset":7,"length":2,
                    "custom_emoji_id":"5368324170671202286"}]}""");

        String reply = inspector.describe(msg);

        assertThat(reply).contains("5368324170671202286");
        // Nusxa olib postga qo'yish uchun tayyor shakl — id yolg'iz o'zi
        // foydasiz, uni qanday yozishni ham eslash kerak bo'lardi.
        assertThat(reply).contains("tg-emoji emoji-id=");
    }

    @Test
    @DisplayName("HTML namunasi matn sifatida ko'rinadi, render bo'lib ketmaydi")
    void theSnippetIsEscaped() {
        JsonNode msg = message("""
                {"text":"/emoji 👍",
                 "entities":[
                   {"type":"custom_emoji","offset":7,"length":2,
                    "custom_emoji_id":"5368324170671202286"}]}""");

        String reply = inspector.describe(msg);

        // Xabar parse_mode=HTML bilan ketadi. Ekranlanmasa Telegram teg'ni
        // o'qishga urinadi va foydalanuvchi nusxa oladigan matn yo'qoladi.
        assertThat(reply).doesNotContain("<tg-emoji");
        assertThat(reply).contains("&lt;tg-emoji");
    }

    @Test
    @DisplayName("bir nechta emoji tartibi bilan qaytadi")
    void readsSeveralInOrder() {
        JsonNode msg = message("""
                {"text":"/emoji 👍🔥",
                 "entities":[
                   {"type":"custom_emoji","offset":7,"length":2,"custom_emoji_id":"111"},
                   {"type":"custom_emoji","offset":9,"length":2,"custom_emoji_id":"222"}]}""");

        String reply = inspector.describe(msg);

        assertThat(reply).contains("111").contains("222");
        assertThat(reply.indexOf("111")).isLessThan(reply.indexOf("222"));
    }

    @Test
    @DisplayName("javob berilgan xabardagi emoji ham o'qiladi")
    void fallsBackToTheRepliedMessage() {
        // Tayyor postni qayta yozib chiqmasdan, unga javoban /emoji
        // yozish qulayroq.
        JsonNode msg = message("""
                {"text":"/emoji",
                 "entities":[{"type":"bot_command","offset":0,"length":6}],
                 "reply_to_message":{
                   "text":"salom 👍",
                   "entities":[{"type":"custom_emoji","offset":6,"length":2,
                                "custom_emoji_id":"999"}]}}""");

        String reply = inspector.describe(msg);

        assertThat(reply).contains("999");
    }

    @Test
    @DisplayName("emoji topilmasa nima qilish kerakligini aytadi")
    void explainsItselfWhenThereIsNothingToRead() {
        JsonNode msg = message("""
                {"text":"/emoji","entities":[
                   {"type":"bot_command","offset":0,"length":6}]}""");

        String reply = inspector.describe(msg);

        assertThat(reply).contains("/emoji");
        assertThat(reply).doesNotContain("tg-emoji emoji-id=");
    }

    @Test
    @DisplayName("offsetlar UTF-16 birliklarida — BMP tashqarisidagi belgidan keyin ham to'g'ri kesadi")
    void offsetsAreUtf16CodeUnits() {
        // Telegram offset/length'ni UTF-16 code unit'da beradi. Matnda oldin
        // turgan 🎮 ikkita code unit egallaydi. Kod belgilar (code point)
        // bo'yicha kessa, emoji o'rniga yarim belgi olinardi.
        JsonNode msg = message("""
                {"text":"🎮 x 👍",
                 "entities":[{"type":"custom_emoji","offset":5,"length":2,
                              "custom_emoji_id":"777"}]}""");

        String reply = inspector.describe(msg);

        assertThat(reply).contains("777").contains("👍");
    }
}
