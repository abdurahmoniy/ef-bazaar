package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Listing;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Kanalga chiqadigan e'lon matni.
 *
 * <p>Bu matn UMUMAN yig'ilmasdi: caption o'rniga null uzatilardi va
 * Telegram matnsiz xabarni qabul qilmasdi — birorta ham post haqiqatda
 * chiqmagan. Shuning uchun bu yerdagi birinchi sinov eng oddiy narsani
 * qo'riqlaydi: matn bo'sh emas.
 */
class ChannelPostCaptionTest {

    private static final String URL = "https://efbazaar.uz/marketplace/abc?p=K7M4XQP2";
    /** Raqam guruhlari UZILMAS bo'shliq bilan ajratiladi — narx satr oxirida bo'linmasin. */
    private static final String NB = "\u00A0";

    private Listing listing(Map<String, Object> attributes) {
        Listing l = new Listing();
        l.setPrice(new BigDecimal("4500000"));
        l.setPriceNegotiable(true);
        l.setDescription("Akkaunt 2 yil o'ynalgan");
        l.setAttributes(new LinkedHashMap<>(attributes));
        return l;
    }

    @Test
    @DisplayName("narx birinchi qatorda va bo'shliq bilan ajratilgan")
    void thePriceLeads() {
        // Xaridor avval shuni qidiradi. "4500000" o'qib bo'lmaydigan
        // son — kanalda odam uni sanab o'tirmaydi.
        String caption = ChannelPostCaption.of(listing(Map.of()), URL);

        assertThat(caption).contains("4" + NB + "500" + NB + "000 so'm");
        assertThat(caption).contains("kelishiladi");
        assertThat(caption.indexOf("4" + NB + "500"))
                .isLessThan(caption.indexOf("efBazaar"));
    }

    @Test
    @DisplayName("havola MATN ichida — forward tugmani yo'qotadi")
    void theLinkLivesInTheText() {
        // Rasmiy kanalga forward qilingan nusxada inline tugma
        // qolmaydi: Telegram uni olib tashlaydi. Havola matnda
        // bo'lmasa, o'sha nusxadan e'longa umuman yo'l qolmasdi.
        String caption = ChannelPostCaption.of(listing(Map.of()), URL);

        assertThat(caption).contains("<a href=\"" + URL + "\">");
    }

    @Test
    @DisplayName("bo'sh va nol maydonlar qatori umuman chiqmaydi")
    void emptyFieldsProduceNoLine() {
        // "iOS coin: 0" hech narsa aytmaydi va rasm ostidagi 1024
        // belgidan yeydi.
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("android_coins", 12400);
        attributes.put("ios_coins", 0);
        attributes.put("has_google_play_link", false);

        String caption = ChannelPostCaption.of(listing(attributes), URL);

        assertThat(caption).contains("Android <b>12" + NB + "400</b>");
        assertThat(caption).doesNotContain("iOS");
        assertThat(caption).doesNotContain("Google Play");
    }

    @Test
    @DisplayName("qimmatli kartalar uchtadan oshmaydi")
    void valuablePlayersAreCapped() {
        // Ro'yxat o'nlab bo'lishi mumkin va u butun matnni yutib
        // yuborardi.
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("valuable_players",
                List.of("Mbappé", "Haaland", "Bellingham", "Vinicius", "Rodri"));

        String caption = ChannelPostCaption.of(listing(attributes), URL);

        assertThat(caption).contains("Mbappé, Haaland, Bellingham +2");
        assertThat(caption).doesNotContain("Vinicius");
    }

    @Test
    @DisplayName("kartadan FAQAT nomi olinadi — obyekt postga to'kilmaydi")
    void aCardShowsItsNameOnly() {
        // valuable_players CARD_LIST: elementlari skill ro'yxati, efhub
        // identifikatori va rasm manzili bo'lgan obyektlar. toString()
        // butun map'ni postga to'kib tashlagan va e'lon kanalda xom
        // ma'lumot bo'lib chiqqan edi.
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("name", "Ferenc Puskas");
        card.put("efhub_id", 78037702765700L);
        card.put("image_url", "https://efimg.com/player_cards/1.png");
        card.put("skills", List.of("heading", "longRangeDrive"));

        String caption = ChannelPostCaption.of(
                listing(Map.of("valuable_players", List.of(card))), URL);

        assertThat(caption).contains("Ferenc Puskas");
        assertThat(caption).doesNotContain("efhub_id")
                .doesNotContain("image_url")
                .doesNotContain("skills")
                .doesNotContain("https://efimg.com");
    }

    @Test
    @DisplayName("nomsiz karta o'tkazib yuboriladi, bo'sh joy qoldirmaydi")
    void aNamelessCardIsSkipped() {
        Map<String, Object> nameless = new LinkedHashMap<>();
        nameless.put("efhub_id", 1L);
        Map<String, Object> named = new LinkedHashMap<>();
        named.put("name", "Haaland");

        String caption = ChannelPostCaption.of(
                listing(Map.of("valuable_players", java.util.Arrays.asList(nameless, named))), URL);

        assertThat(caption).contains("Haaland");
        assertThat(caption).doesNotContain("⭐️ ,");
    }

    @Test
    @DisplayName("eski e'londagi oddiy matnli ro'yxat ham ishlaydi")
    void aPlainStringListStillWorks() {
        String caption = ChannelPostCaption.of(
                listing(Map.of("valuable_players", List.of("Mbappé", "Haaland"))), URL);

        assertThat(caption).contains("Mbappé, Haaland");
    }

    @Test
    @DisplayName("sotuvchi tavsifidagi HTML matnni buzmaydi")
    void sellerTextIsEscaped() {
        // Tavsif — foydalanuvchi yozgan matn. Escape qilmasak "<b" kabi
        // belgi Telegram HTML'ini buzar va POST BUTUNLAY chiqmasdi.
        Listing l = listing(Map.of());
        l.setDescription("Narx <juda> yaxshi & arzon");

        String caption = ChannelPostCaption.of(l, URL);

        assertThat(caption).contains("&lt;juda&gt;").contains("&amp;");
    }

    @Test
    @DisplayName("uzun tavsif so'z o'rtasidan kesilmaydi")
    void aLongDescriptionIsCutAtAWord() {
        Listing l = listing(Map.of());
        l.setDescription("so'z ".repeat(200));

        String caption = ChannelPostCaption.of(l, URL);

        assertThat(caption).contains("…");
        assertThat(caption.length()).isLessThanOrEqualTo(1024);
    }

    @Test
    @DisplayName("sotilganda ustidan chiziladi va HAVOLA olib tashlanadi")
    void soldStrikesThroughAndDropsTheLink() {
        // Ustidan chizilgan havola ham bosiladigan havolaligicha
        // qoladi: odam mavjud bo'lmagan taklifga borardi.
        String sold = ChannelPostCaption.sold(ChannelPostCaption.of(listing(Map.of()), URL));

        assertThat(sold).startsWith("<b>❌ SOTILDI</b>");
        assertThat(sold).contains("<s>").contains("</s>");
        assertThat(sold).doesNotContain("href");
        // Matn qoladi — obunachi nima sotilganini ko'rishi kerak.
        assertThat(sold).contains("4" + NB + "500" + NB + "000");
    }
}
