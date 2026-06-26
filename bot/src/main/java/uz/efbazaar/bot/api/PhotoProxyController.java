package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Duration;
import java.util.Optional;

/**
 * Telegram da saqlangan rasmni public URL sifatida ko'rsatadi.
 * Frontend listing rasmlarini shu endpoint orqali ko'rsatadi.
 *
 * <p>Path: {@code /bot/photo/{fileId}} — nginx orqali public.
 */
@Slf4j
@RestController
@RequestMapping("/bot/photo")
@RequiredArgsConstructor
public class PhotoProxyController {

    private final TelegramApiClient telegram;

    @GetMapping("/{fileId}")
    public ResponseEntity<byte[]> photo(@PathVariable String fileId) {
        Optional<String> filePath = telegram.getFilePath(fileId);
        if (filePath.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Rasm topilmadi");
        }
        Optional<byte[]> bytes = telegram.downloadFile(filePath.get());
        if (bytes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Rasmni yuklab olishda xato");
        }

        MediaType contentType = guessContentType(filePath.get());
        return ResponseEntity.ok()
                .contentType(contentType)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
                .body(bytes.get());
    }

    private MediaType guessContentType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".png")) return MediaType.IMAGE_PNG;
        if (lower.endsWith(".webp")) return MediaType.valueOf("image/webp");
        if (lower.endsWith(".gif")) return MediaType.IMAGE_GIF;
        return MediaType.IMAGE_JPEG;
    }
}
