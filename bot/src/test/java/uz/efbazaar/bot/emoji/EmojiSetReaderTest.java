package uz.efbazaar.bot.emoji;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * `getStickerSet` javobini efBazaar tushunadigan shaklga o'giradi.
 *
 * <p>Ikkita narsa muhim. Birinchisi — format: paketdagi emoji video
 * (`.webm`), animatsiyali (`.tgs`) yoki oddiy rasm bo'lishi mumkin va
 * brauzer uchalasini boshqacha chizadi. Ikkinchisi — thumbnail: panelda 200
 * ta video birdan o'ynatilsa brauzer bo'g'iladi, shuning uchun panelga
 * statik rasm, animatsiya esa faqat matn va preview ichida.
 */
class EmojiSetReaderTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final EmojiSetReader reader = new EmojiSetReader();

    private EmojiSetView read(String json) {
        try {
            return reader.read(mapper.readTree(json));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    @DisplayName("to'plam nomi, sarlavhasi va emoji'larini o'qiydi")
    void readsTheSet() {
        EmojiSetView set = read("""
                {"name":"MixAnimeEmoji","title":"Mix Anime","sticker_type":"custom_emoji",
                 "stickers":[
                   {"custom_emoji_id":"111","emoji":"🙂","file_id":"AAA",
                    "is_animated":false,"is_video":true,
                    "thumbnail":{"file_id":"THUMB1"}}]}""");

        assertThat(set.name()).isEqualTo("MixAnimeEmoji");
        assertThat(set.title()).isEqualTo("Mix Anime");
        assertThat(set.items()).hasSize(1);
        var item = set.items().getFirst();
        assertThat(item.customEmojiId()).isEqualTo("111");
        // Zaxira emoji: custom emoji yuklanmasa yoki yuborib bo'lmasa shu
        // ko'rinadi, shuning uchun uni yo'qotib qo'ymaslik kerak.
        assertThat(item.emoji()).isEqualTo("🙂");
    }

    @Test
    @DisplayName("uch formatni ajratadi")
    void tellsTheThreeFormatsApart() {
        EmojiSetView set = read("""
                {"name":"S","title":"S","stickers":[
                  {"custom_emoji_id":"1","emoji":"a","file_id":"A","is_video":true,"is_animated":false},
                  {"custom_emoji_id":"2","emoji":"b","file_id":"B","is_video":false,"is_animated":true},
                  {"custom_emoji_id":"3","emoji":"c","file_id":"C","is_video":false,"is_animated":false}]}""");

        assertThat(set.items()).extracting(EmojiSetView.Item::format)
                .containsExactly("video", "animated", "static");
    }

    @Test
    @DisplayName("thumbnail bo'lmasa emoji'ning o'zi panelda ko'rsatiladi")
    void fallsBackToTheStickerWhenThereIsNoThumbnail() {
        // Statik emoji'da thumbnail bo'lmasligi mumkin — u baribir rasm,
        // to'g'ridan-to'g'ri chiziladi. Bo'sh qoldirsak panelda teshik qolardi.
        EmojiSetView set = read("""
                {"name":"S","title":"S","stickers":[
                  {"custom_emoji_id":"1","emoji":"a","file_id":"OWN",
                   "is_video":false,"is_animated":false}]}""");

        assertThat(set.items().getFirst().thumbnailFileId()).isEqualTo("OWN");
    }

    @Test
    @DisplayName("custom emoji bo'lmagan yozuvlar tashlanadi")
    void skipsEntriesThatAreNotCustomEmoji() {
        // Oddiy stikerda custom_emoji_id bo'lmaydi va uni matn ichiga
        // qo'yib bo'lmaydi. Saqlasak, panelda bosilganda hech narsa
        // qo'yilmaydigan katak paydo bo'lardi.
        EmojiSetView set = read("""
                {"name":"S","title":"S","stickers":[
                  {"emoji":"a","file_id":"A"},
                  {"custom_emoji_id":"2","emoji":"b","file_id":"B"}]}""");

        assertThat(set.items()).hasSize(1);
        assertThat(set.items().getFirst().customEmojiId()).isEqualTo("2");
    }
}
