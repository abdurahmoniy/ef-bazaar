package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Duration;
import java.util.Optional;

/**
 * Emoji faylini brauzerga beradi ({@code /bot/emoji/{fileId}} — public).
 *
 * <p>Nega proksi kerak: Telegram fayl havolasi
 * {@code api.telegram.org/file/bot<TOKEN>/...} ko'rinishida, ya'ni token URL
 * ichida. Brauzerga bersak, tokenimiz sahifa manbasida ochiq turardi.
 *
 * <p>{@link FileProxyController} dan farqi — u har narsani `octet-stream`
 * qilib yuklatib yuboradi, bu esa sahifada CHIZILISHI kerak. Shuning uchun
 * turlar oq ro'yxatda: faqat emoji formatlari. Nomaʼlum kengaytma
 * `octet-stream` bo'ladi, ya'ni chizilmaydi — soxta HTML yoki SVG bizning
 * domenimizda bajarilib ketmasin.
 *
 * <p>Kesh uzoq: `file_id` o'zgarmaydi va uning ortidagi fayl ham. Har
 * ko'rsatishda Telegram'ga borish panelni 200 ta so'rovga aylantirardi.
 */
@RestController
@RequestMapping("/bot/emoji")
@RequiredArgsConstructor
public class EmojiFileController {

    private final TelegramApiClient telegram;

    @GetMapping("/{fileId}")
    public ResponseEntity<byte[]> file(@PathVariable String fileId) {
        Optional<String> filePath = telegram.getFilePath(fileId);
        if (filePath.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fayl topilmadi");
        }
        Optional<byte[]> bytes = telegram.downloadFile(filePath.get());
        if (bytes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Faylni yuklab olishda xato");
        }
        return ResponseEntity.ok()
                .contentType(contentTypeOf(filePath.get()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .body(bytes.get());
    }

    static MediaType contentTypeOf(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".webm")) return MediaType.valueOf("video/webm");
        if (lower.endsWith(".webp")) return MediaType.valueOf("image/webp");
        if (lower.endsWith(".png")) return MediaType.IMAGE_PNG;
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return MediaType.IMAGE_JPEG;
        // .tgs — gzip qilingan Lottie JSON. Brauzer uni o'zi chiza olmaydi,
        // frontend gunzip qilib lottie'ga beradi, shuning uchun aynan gzip
        // deb aytamiz.
        if (lower.endsWith(".tgs")) return MediaType.valueOf("application/gzip");
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
