package uz.efbazaar.bot.guide;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tugma bosilganda Telegram bizga faqat `callback_data` ni qaytaradi —
 * boshqa hech narsa. Ya'ni qaysi qo'llanma ekani AYNAN shu satrda
 * bo'lishi kerak.
 *
 * <p>Telegram uni 64 BAYT bilan cheklaydi. Oshsa tugma jimgina
 * ishlamaydi: xato ham, xabar ham yo'q.
 */
class GuideCallbackTest {

    @Test
    @DisplayName("qo'llanma id'si satrga va orqaga o'giriladi")
    void roundTripsTheGuideId() {
        UUID id = UUID.randomUUID();

        assertThat(GuideCallback.parse(GuideCallback.of(id))).contains(id);
    }

    @Test
    @DisplayName("satr Telegram chegarasiga sig'adi")
    void fitsTelegramsLimit() {
        String data = GuideCallback.of(UUID.randomUUID());

        assertThat(data.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(64);
    }

    @Test
    @DisplayName("boshqa tugmalar e'tiborga olinmaydi")
    void ignoresOtherCallbacks() {
        // Botda kelajakda boshqa callback tugmalar bo'lishi mumkin. Ularni
        // qo'llanma deb o'qisak, foydalanuvchi tushunarsiz javob olardi.
        assertThat(GuideCallback.parse("boshqa:123")).isEmpty();
        assertThat(GuideCallback.parse("guide:")).isEmpty();
        assertThat(GuideCallback.parse("guide:not-a-uuid")).isEmpty();
        assertThat(GuideCallback.parse(null)).isEmpty();
    }

    @Test
    @DisplayName("bir xil uzunlikdagi boshqa prefiks qo'llanma deb o'qilmaydi")
    void aDifferentPrefixOfTheSameLengthIsNotAGuide() {
        // "order:" ham, "guide:" ham olti belgi. Prefiks tekshirilmasa,
        // faqat kesib olingan qism UUID bo'lgani uchun begona tugma
        // qo'llanma deb o'qilardi va foydalanuvchi kutilmagan video
        // olardi. Boshqa testlar buni ko'rmaydi: ulardagi satrlar
        // kesilgandan keyin baribir UUID bo'lmaydi.
        assertThat(GuideCallback.parse("order:" + UUID.randomUUID())).isEmpty();
    }
}
