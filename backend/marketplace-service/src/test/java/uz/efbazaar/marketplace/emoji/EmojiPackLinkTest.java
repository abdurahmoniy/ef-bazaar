package uz.efbazaar.marketplace.emoji;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Admin paketni havola bilan qo'shadi; bizga esa Telegram tushunadigan
 * to'plam nomi kerak.
 *
 * <p>Nom havolaning oxirgi bo'lagida turadi va shu bilan `getStickerSet`
 * chaqiriladi. Noto'g'ri ajratsak, xato "paket topilmadi" bo'lib chiqadi va
 * admin havolani ayblab, qayta-qayta urinib ko'radi.
 */
class EmojiPackLinkTest {

    @Test
    @DisplayName("odatiy havoladan to'plam nomini oladi")
    void readsTheUsualLink() {
        assertThat(EmojiPackLink.setNameOf("https://t.me/addemoji/MixAnimeEmoji"))
                .isEqualTo("MixAnimeEmoji");
    }

    @Test
    @DisplayName("nomning o'zi ham qabul qilinadi")
    void acceptsABareName() {
        // Admin havolani emas, nomni ko'chirib qo'yishi tabiiy — bot
        // javoblarida ham nom ko'rinadi.
        assertThat(EmojiPackLink.setNameOf("CR7new_by_TgEmodziBot"))
                .isEqualTo("CR7new_by_TgEmodziBot");
    }

    @Test
    @DisplayName("http, www, so'rov va bo'shliqlar to'sqinlik qilmaydi")
    void toleratesTheWaysPeopleActuallyPaste() {
        // Telegram ulashish menyusi ba'zan ?single yoki utm qo'shadi, mobil
        // klaviatura esa oxiriga bo'shliq qo'yadi.
        assertThat(EmojiPackLink.setNameOf("  http://www.t.me/addemoji/Foo?single  "))
                .isEqualTo("Foo");
    }

    @Test
    @DisplayName("stiker havolasi emoji havolasi emas — rad etiladi")
    void rejectsAStickerLink() {
        // /addstickers boshqa narsa: oddiy stiker to'plami, matn ichiga
        // qo'yib bo'lmaydi. Qabul qilsak, import o'tadi-yu emoji ishlamaydi.
        assertThatThrownBy(() -> EmojiPackLink.setNameOf("https://t.me/addstickers/Foo"))
                .isInstanceOf(IllegalArgumentException.class)
                // Xabarning o'zi shu tarmoqning butun ma'nosi. Umumiy "havola
                // noto'g'ri" bo'lsa, admin to'g'ri havolani qidirib yurardi —
                // ikkalasi ko'rinishdan bir xil.
                .hasMessageContaining("stiker");
    }

    @Test
    @DisplayName("bo'sh va shaklsiz qiymatlar rad etiladi")
    void rejectsNonsense() {
        assertThatThrownBy(() -> EmojiPackLink.setNameOf("   "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EmojiPackLink.setNameOf("https://t.me/addemoji/"))
                .isInstanceOf(IllegalArgumentException.class);
        // To'plam nomi Telegram qoidasi bo'yicha harf, raqam va pastki chiziq.
        assertThatThrownBy(() -> EmojiPackLink.setNameOf("Foo/../bar"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("nom URL yo'liga qo'yishga xavfsiz")
    void theNameIsSafeToPutInAUrl() {
        // Nom to'g'ridan-to'g'ri getStickerSet?name= ga ketadi. Qochib
        // ketadigan belgi qolsa, bu so'rov injeksiyasi bo'lardi.
        assertThat(EmojiPackLink.setNameOf("https://t.me/addemoji/Abc_123"))
                .matches("[A-Za-z0-9_]+");
    }
}
