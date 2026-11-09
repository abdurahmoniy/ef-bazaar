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
}
