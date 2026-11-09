package uz.efbazaar.marketplace.chat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Chatdagi kontaktni yashirish.
 *
 * <p>Ikki tomonlama xato bor. O'tkazib yuborilgan kontakt xaridorni
 * garovsiz savdoga olib ketadi. Noto'g'ri yashirilgan matn esa
 * (Konami ID, narx, reyting) suhbatni buzadi — bu bozorda shunday
 * raqamlar har bir xabarda bor.
 */
class ContactShieldTest {

    private static final String HIDDEN = ContactShield.PLACEHOLDER;

    @ParameterizedTest
    @ValueSource(strings = {
            "telegramdan yozing @seller_uz",
            "@Seller123 ga yozing",
            "t.me/seller_uz",
            "https://t.me/seller_uz",
            "telegram.me/seller_uz",
            "+998 90 123 45 67",
            "+998901234567",
            "998-90-123-45-67",
            "90 123 45 67",
            "901234567",
            "(93) 123-45-67",
            "9 0 1 2 3 4 5 6 7",
            "+7 912 345 67 89",
    })
    @DisplayName("telegram handles and phone numbers are hidden")
    void hidesContacts(String text) {
        ContactShield.Result result = ContactShield.mask(text);

        assertThat(result.hidden()).as(text).isTrue();
        assertThat(result.text()).contains(HIDDEN);
        assertThat(result.text()).doesNotContainPattern("\\d{3}.?\\d{2}.?\\d{2}").doesNotContain("seller");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Konami ID: ASJE-112-079-938",
            "ASJE-901-234-567 ulangan",
            "narxi 150 000 so'm",
            "1 500 000 so'mga beraman",
            "3313 sila, Mbappe 107, Guler 104",
            "GP: 2.9M+, 5500 coins",
            "pochta: seller@gmail.com",
            "bugun 18:30 da",
            "salom, akkaunt hali sotuvdami?",
    })
    @DisplayName("game IDs, prices, ratings and emails stay untouched")
    void leavesOrdinaryTextAlone(String text) {
        ContactShield.Result result = ContactShield.mask(text);

        assertThat(result.hidden()).as(text).isFalse();
        assertThat(result.text()).isEqualTo(text);
    }

    @ParameterizedTest
    @ValueSource(strings = {"salom @seller_uz va +998901234567 ham bor"})
    @DisplayName("every contact in a message is hidden, the rest is kept")
    void hidesEveryContact(String text) {
        ContactShield.Result result = ContactShield.mask(text);

        assertThat(result.text()).isEqualTo("salom " + HIDDEN + " va " + HIDDEN + " ham bor");
    }

    @org.junit.jupiter.api.Test
    @DisplayName("a phone glued to a price is still found, and the price survives")
    void phoneNextToPrice() {
        assertThat(ContactShield.mask("150000 901234567").text()).isEqualTo("150000 " + HIDDEN);
        assertThat(ContactShield.mask("901234567 150000").text()).isEqualTo(HIDDEN + " 150000");
    }

    private static final java.util.Set<String> HANDLES = java.util.Set.of("seller_uz");

    @ParameterizedTest
    @ValueSource(strings = {
            "seller_uz ga yozing",
            "SELLER_UZ",
            "Seller_Uz, yozib qo'ying",
            "menga (seller_uz) deb yozing",
            "seller_uzга напиши",
    })
    @DisplayName("a participant's handle is hidden without @, in any case")
    void hidesKnownHandleWithoutAt(String text) {
        ContactShield.Result result = ContactShield.mask(text, HANDLES);

        assertThat(result.hidden()).as(text).isTrue();
        assertThat(result.text()).contains(HIDDEN).doesNotContainPattern("(?i)seller_uz");
    }

    @org.junit.jupiter.api.Test
    @DisplayName("known handles may be stored with @ and in mixed case")
    void normalizesKnownHandles() {
        assertThat(ContactShield.mask("seller_uz ga yozing", java.util.Set.of("@Seller_Uz", " ")).text())
                .isEqualTo(HIDDEN + " ga yozing");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "toza_akk",
            "seller_uz2 boshqa odam",
            "xseller_uz boshqa odam",
            "pochta: seller_uz@gmail.com",
            "pochta: info@seller_uz.com",
    })
    @DisplayName("only the whole handle matches: longer words and emails stay")
    void leavesLookalikesOfKnownHandle(String text) {
        ContactShield.Result result = ContactShield.mask(text, HANDLES);

        assertThat(result.hidden()).as(text).isFalse();
        assertThat(result.text()).isEqualTo(text);
    }

    @org.junit.jupiter.api.Test
    @DisplayName("a handle spelled like the placeholder does not corrupt it")
    void placeholderSurvivesKnownHandleMatching() {
        assertThat(ContactShield.mask("@other_user", java.util.Set.of("kontakt", "yashirildi")).text())
                .isEqualTo(HIDDEN);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "tg: seller_uz",
            "TG seller_uz",
            "tg:seller_uz",
            "tgim seller_uz",
            "tg'im seller_uz",
            "telegramim seller_uz",
            "telegram - seller_uz",
            "lichkaga yozing seller_uz",
            "lichkamga mana seller_uz",
            "username: ali_007",
            "user=ali_007",
            "nik ali_007",
            "nick: ali_007",
            "тг: seller_uz",
            "телеграмм seller_uz",
            "личку напишите seller_uz",
            "ник: ali_007",
            "tg seller ga yozing",
            "telegram sellerbek qa yozing",
            "telegram username seller_uz",
    })
    @DisplayName("a handle-like token right after a contact keyword is hidden")
    void hidesTokenAfterKeyword(String text) {
        ContactShield.Result result = ContactShield.mask(text);

        assertThat(result.hidden()).as(text).isTrue();
        assertThat(result.text()).contains(HIDDEN).doesNotContainPattern("(?i)seller|ali_007");
    }

    @org.junit.jupiter.api.Test
    @DisplayName("only the token is hidden: keyword and the rest of the message stay")
    void keepsKeywordAndRestOfMessage() {
        assertThat(ContactShield.mask("tg: seller_uz, narxi 150 000").text())
                .isEqualTo("tg: " + HIDDEN + ", narxi 150 000");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "telegramdan yozing",
            "telegramdan yozing ga",
            "tg orqali emas, shu yerda",
            "telegramga ulangan akkaunt",
            "telegram ulangan, toza_akk 150000",
            "lichkaga yozing",
            "Mbappe 107",
            "toza_akk",
            "konami id ulangan",
            "user bilan gaplashdim",
            "user 5500 coins",
            "nik o'zgartirdim",
            "tg: seller@gmail.com",
            "<tg-emoji emoji-id=\"5368324170671202286\">🔥</tg-emoji> salom",
    })
    @DisplayName("ordinary words after a keyword stay untouched")
    void leavesOrdinaryWordsAfterKeyword(String text) {
        ContactShield.Result result = ContactShield.mask(text);

        assertThat(result.hidden()).as(text).isFalse();
        assertThat(result.text()).isEqualTo(text);
    }
}
