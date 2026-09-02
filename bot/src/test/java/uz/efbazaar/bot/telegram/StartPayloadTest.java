package uz.efbazaar.bot.telegram;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Chuqur havola yuki.
 *
 * <p>{@code t.me/<bot>?start=ref_ABCD2345} Telegram tomonidan
 * {@code /start ref_ABCD2345} matni sifatida yetkaziladi. Shakl
 * brauzerdagi {@code referral-capture.ts} va serverdagi
 * {@code ReferralCodeService} bilan bir xil bo'lishi kerak.
 */
class StartPayloadTest {

    @Test
    @DisplayName("a referral payload is extracted")
    void extractsReferral() {
        assertThat(UpdateHandler.startPayload("/start ref_ABCD2345")).isEqualTo("ABCD2345");
    }

    @Test
    @DisplayName("a lower-case payload is normalised")
    void normalises() {
        assertThat(UpdateHandler.startPayload("/start ref_abcd2345")).isEqualTo("ABCD2345");
    }

    @Test
    @DisplayName("a bare /start carries nothing")
    void bareStart() {
        assertThat(UpdateHandler.startPayload("/start")).isNull();
        assertThat(UpdateHandler.startPayload("/start ")).isNull();
        assertThat(UpdateHandler.startPayload(null)).isNull();
    }

    @Test
    @DisplayName("a payload that is not a referral is ignored")
    void otherPayload() {
        // Kelajakda boshqa yuklar ham bo'lishi mumkin — ular jimgina
        // o'tib ketishi kerak, xato bermasligi.
        assertThat(UpdateHandler.startPayload("/start somethingelse")).isNull();
        assertThat(UpdateHandler.startPayload("/start ref_")).isNull();
        assertThat(UpdateHandler.startPayload("/start ref_TOOLONGCODE")).isNull();
        assertThat(UpdateHandler.startPayload("/start ref_short")).isNull();
        assertThat(UpdateHandler.startPayload("/start ref_ABCD 2345")).isNull();
    }

    @Test
    @DisplayName("the bot's own deep-link prefix matches what the invite page builds")
    void prefixMatchesTheLink() {
        // Taklif sahifasi https://t.me/<bot>?start=ref_<kod> yasaydi.
        // Ikki yarim shu yerda uchrashadi; prefiks bir tomonda
        // o'zgarsa, havola jimgina ishlamay qoladi.
        String code = "K7M4XQP2";
        assertThat(UpdateHandler.startPayload("/start " + "ref_" + code)).isEqualTo(code);
    }
}
