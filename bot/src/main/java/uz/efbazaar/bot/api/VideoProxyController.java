package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
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
 * Telegram'da saqlangan video qo'llanmani brauzerda ko'rish uchun proksi
 * ({@code /bot/video/{fileId}} — nginx orqali public).
 *
 * <p>{@link FileProxyController} dan farqi: u faylni {@code octet-stream}
 * va {@code attachment} sifatida yuklatib yuboradi, bu esa sahifada
 * {@code <video>} elementi orqali inline ijro etilishi kerak.
 *
 * <p>Inline disposition va video MIME type (video/mp4, video/webm) beriladi,
 * shuningdek kesh 7 kunga qo'yiladi.
 */
@Slf4j
@RestController
@RequestMapping("/bot/video")
@RequiredArgsConstructor
public class VideoProxyController {

    private final TelegramApiClient telegram;

    @GetMapping("/{fileId}")
    public ResponseEntity<byte[]> video(@PathVariable String fileId) {
        Optional<String> filePath = telegram.getFilePath(fileId);
        if (filePath.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Video topilmadi");
        }
        Optional<byte[]> bytes = telegram.downloadFile(filePath.get());
        if (bytes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Videoni yuklab olishda xato");
        }

        MediaType contentType = guessContentType(filePath.get());
        return ResponseEntity.ok()
                .contentType(contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
                .body(bytes.get());
    }

    static MediaType guessContentType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".webm")) return MediaType.valueOf("video/webm");
        if (lower.endsWith(".ogg") || lower.endsWith(".ogv")) return MediaType.valueOf("video/ogg");
        return MediaType.valueOf("video/mp4");
    }
}
