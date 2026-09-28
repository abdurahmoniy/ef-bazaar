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
    @DisplayName("hamkor bloklarni o'chira va tartibini almashtira oladi")
    void theLayoutDecidesWhatAppearsAndInWhatOrder() {
        // Ba'zi kanallar tavsifni eng yuqorida joylaydi, ba'zilari
        // oxirida. Bitta qat'iy tartib ikkalasiga ham to'g'ri kelmaydi.
        var layout = ChannelPostLayout.parse(List.of("DESCRIPTION", "PRICE"));

        String caption = ChannelPostCaption.of(listing(Map.of()), URL, layout, null);

        assertThat(caption.indexOf("Akkaunt 2 yil"))
                .as("tavsif narxdan oldin turishi kerak")
                .isLessThan(caption.indexOf("so'm"));
        // O'chirilgan bloklar umuman chiqmaydi.
        assertThat(caption).doesNotContain("eFootball akkaunt");
    }

    @Test
    @DisplayName("footer post oxirida, efBazaar qatoridan oldin turadi")
    void theFooterSitsAboveTheEfbazaarLine() {
        String caption = ChannelPostCaption.of(listing(Map.of()), URL,
                ChannelPostLayout.defaults(), "Rasmiy Sahifalarimiz\n🎮 @java_esports");

        assertThat(caption).contains("@java_esports");
        assertThat(caption.indexOf("@java_esports")).isLessThan(caption.indexOf("efBazaar</a>"));
    }

    @Test
    @DisplayName("uzun footer kesiladi — u postning qolganini yeb qo'ymasin")
    void anOverlongFooterIsCut() {
        String caption = ChannelPostCaption.of(listing(Map.of()), URL,
                ChannelPostLayout.defaults(), "@kanal ".repeat(200));

        // efBazaar havolasi baribir joyida qoladi: usiz forward
        // qilingan nusxadan e'longa yo'l yo'q.
        assertThat(caption).contains("efBazaar</a>");
        assertThat(caption.length()).isLessThanOrEqualTo(1024);
    }

    @Test
    @DisplayName("footerdagi HTML matnni buzmaydi")
    void theFooterIsEscaped() {
        // Hamkor yozgan "<" Telegram HTML'ini buzib, postni butunlay
        // chiqmaydigan qilardi.
        String caption = ChannelPostCaption.of(listing(Map.of()), URL,
                ChannelPostLayout.defaults(), "<b>reklama</b> & narx");

        assertThat(caption).contains("&lt;b&gt;").contains("&amp;");
    }

    @Test
    @DisplayName("noma'lum blok butun sozlamani yiqitmaydi")
    void anUnknownBlockIsIgnored() {
        // Blok o'chirilgan yoki nomi o'zgargan bo'lsa, saqlangan
        // sozlama tufayli post bo'sh chiqmasligi kerak.
        var layout = ChannelPostLayout.parse(List.of("PRICE", "OLD_BLOCK_NAME"));

        assertThat(layout.keys()).containsExactly("PRICE");
        assertThat(ChannelPostCaption.of(listing(Map.of()), URL, layout, null))
                .contains("so'm");
    }

    @Test
    @DisplayName("bo'sh sozlama default ko'rinishga qaytadi")
    void anEmptyLayoutFallsBackToTheDefault() {
        // Hech narsasiz post e'lon haqida hech narsa aytmaydi.
        var expected = List.of("HEADER", "PRICE", "STRENGTH", "PLAYERS", "COINS", "DESCRIPTION");
        assertThat(ChannelPostLayout.parse(List.of()).keys()).containsExactlyElementsOf(expected);
        assertThat(ChannelPostLayout.parse(null).keys()).containsExactlyElementsOf(expected);
        // HAMMASI noma'lum bo'lgan holat boshqa shoxdan o'tadi: ro'yxat
        // bo'sh emas, lekin undan birorta ham blok tanilmaydi.
        assertThat(ChannelPostLayout.parse(List.of("OLD_ONE", "GONE")).keys())
                .containsExactlyElementsOf(expected);
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

    @Test
    @DisplayName("sarlavha e'lon turini aytadi: sotuv, obmen yoki obmen + doplata")
    void theHeaderNamesTheDealType() {
        // Ilgari har bir post "eFootball akkaunt" + narx bilan chiqardi,
        // ya'ni obmen e'loni ham kanalda sotuvdek ko'rinardi.
        assertThat(header(null)).contains("SOTILADI");
        assertThat(header("NONE")).contains("SOTILADI");
        assertThat(header("EXCHANGE_ONLY")).contains("OBMEN").doesNotContain("SOTILADI", "DOPLATA");
        assertThat(header("EXCHANGE_WITH_SURCHARGE")).contains("OBMEN + DOPLATA");
        assertThat(header("BOTH")).contains("OBMEN YOKI OBMEN + DOPLATA");
    }

    @Test
    @DisplayName("faqat obmenda narx chiqmaydi, doplatalida qoladi")
    void onlyAPureExchangeHidesThePrice() {
        // Faqat obmen e'lonida pul so'ralmaydi — narx qatori xaridorni
        // chalg'itib, postni yana sotuvga o'xshatardi.
        assertThat(caption("EXCHANGE_ONLY")).doesNotContain("so'm");
        assertThat(caption("EXCHANGE_WITH_SURCHARGE")).contains("4" + NB + "500" + NB + "000 so'm");
        assertThat(caption("BOTH")).contains("so'm");
        assertThat(caption(null)).contains("so'm");
    }

    @Test
    @DisplayName("hamkor sarlavhani o'chirgan bo'lsa ham e'lon turi chiqadi")
    void theDealTypeSurvivesADisabledHeader() {
        var layout = ChannelPostLayout.parse(List.of("PRICE", "STRENGTH"));

        String caption = ChannelPostCaption.of(
                listing(Map.of("exchange_mode", "EXCHANGE_WITH_SURCHARGE")), URL, layout, null);

        assertThat(caption).startsWith("<b>OBMEN + DOPLATA</b>");
        assertThat(caption).doesNotContain("eFootball akkaunt");
    }

    @Test
    @DisplayName("obmen qatori xom kod emas, o'qiladigan nom chiqaradi")
    void theExchangeBlockShowsALabel() {
        var layout = ChannelPostLayout.parse(List.of("HEADER", "EXCHANGE"));

        String caption = ChannelPostCaption.of(
                listing(Map.of("exchange_mode", "EXCHANGE_WITH_SURCHARGE")), URL, layout, null);

        assertThat(caption).contains("🔄 Obmen + doplata");
        assertThat(caption).doesNotContain("EXCHANGE_WITH_SURCHARGE");
    }

    private String caption(String exchangeMode) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        if (exchangeMode != null) attributes.put("exchange_mode", exchangeMode);
        return ChannelPostCaption.of(listing(attributes), URL);
    }

    private String header(String exchangeMode) {
        return caption(exchangeMode).lines().findFirst().orElse("");
    }
}
