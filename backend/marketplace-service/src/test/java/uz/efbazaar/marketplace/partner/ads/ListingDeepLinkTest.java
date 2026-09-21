package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ListingDeepLinkTest {

    private static final UUID LISTING = UUID.fromString("0f6cbe4c-7a1b-4c2f-9a0e-0f2a1b3c4d5e");
    private static final String CODE = "K7M4XQP2";

    private final ListingDeepLink configured =
            new ListingDeepLink("https://efbazaar.uz", "https://t.me/EfBazaarBot/app");

    @Test
    @DisplayName("matndagi havola har doim sayt manzili — postni Telegramdan tashqarida ham ochish mumkin")
    void theCaptionLinkStaysAWebAddress() {
        assertThat(configured.webUrl(LISTING, CODE))
                .isEqualTo("https://efbazaar.uz/marketplace/" + LISTING + "?p=" + CODE);
        assertThat(configured.webUrl(LISTING, null))
                .isEqualTo("https://efbazaar.uz/marketplace/" + LISTING);
    }

    @Test
    @DisplayName("hamkor tugmasi kodni startapp ichida olib ketadi")
    void thePartnerButtonCarriesTheCode() {
        assertThat(configured.buttonUrl(LISTING, CODE))
                .isEqualTo("https://t.me/EfBazaarBot/app?startapp=" + LISTING + "_" + CODE);
    }

    @Test
    @DisplayName("rasmiy kanal tugmasida kod yo'q")
    void theOfficialButtonHasNoCode() {
        // Rasmiy kanal hech qaysi hamkorga tegishli emas: undan kelgan
        // kirish referal sifatida hisoblanmasligi kerak.
        assertThat(configured.buttonUrl(LISTING, null))
                .isEqualTo("https://t.me/EfBazaarBot/app?startapp=" + LISTING);
        assertThat(configured.buttonUrl(LISTING, "  ")).doesNotContain("_");
    }

    @Test
    @DisplayName("Mini App sozlanmagan bo'lsa tugma sayt havolasiga tushadi")
    void anUnconfiguredMiniAppFallsBackToTheSite() {
        // BotFather'da qisqa nom ochilmagan muhitda t.me havolasi o'lik
        // bo'lardi; brauzerda ochilgani undan yaxshi.
        ListingDeepLink plain = new ListingDeepLink("https://efbazaar.uz", "");

        assertThat(plain.buttonUrl(LISTING, CODE))
                .isEqualTo("https://efbazaar.uz/marketplace/" + LISTING + "?p=" + CODE);
        assertThat(plain.buttonUrl(LISTING, null))
                .isEqualTo("https://efbazaar.uz/marketplace/" + LISTING);
    }

    @Test
    @DisplayName("manzil oxiridagi qiyshiq chiziq ikkilanmaydi")
    void trailingSlashesDoNotDouble() {
        ListingDeepLink slashed =
                new ListingDeepLink("https://efbazaar.uz/", "https://t.me/EfBazaarBot/app/");

        assertThat(slashed.webUrl(LISTING, null))
                .isEqualTo("https://efbazaar.uz/marketplace/" + LISTING);
        assertThat(slashed.buttonUrl(LISTING, null))
                .isEqualTo("https://t.me/EfBazaarBot/app?startapp=" + LISTING);
    }
}
