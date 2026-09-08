package uz.efbazaar.bot.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Bu endpoint sahifada CHIZILADIGAN fayl beradi, ya'ni content-type — xavfsizlik
 * chegarasi. Oq ro'yxatda bo'lmagan hamma narsa `octet-stream` bo'lishi kerak:
 * aks holda Telegram'dan kelgan soxta HTML yoki SVG bizning domenimizda
 * bajarilib ketardi.
 */
class EmojiFileControllerTest {

    @Test
    @DisplayName("emoji formatlari chiziladigan tur bilan beriladi")
    void servesEmojiFormatsInline() {
        assertThat(EmojiFileController.contentTypeOf("stickers/x.webm")).hasToString("video/webm");
        assertThat(EmojiFileController.contentTypeOf("stickers/x.webp")).hasToString("image/webp");
        assertThat(EmojiFileController.contentTypeOf("thumb/x.PNG")).hasToString("image/png");
        // .tgs — gzip qilingan Lottie JSON, brauzer o'zi chiza olmaydi.
        assertThat(EmojiFileController.contentTypeOf("a/x.tgs")).hasToString("application/gzip");
    }

    @Test
    @DisplayName("noma'lum tur chizilmaydi")
    void anythingElseIsNotRenderable() {
        assertThat(EmojiFileController.contentTypeOf("x.svg"))
                .hasToString("application/octet-stream");
        assertThat(EmojiFileController.contentTypeOf("x.html"))
                .hasToString("application/octet-stream");
        assertThat(EmojiFileController.contentTypeOf("noextension"))
                .hasToString("application/octet-stream");
    }
}
