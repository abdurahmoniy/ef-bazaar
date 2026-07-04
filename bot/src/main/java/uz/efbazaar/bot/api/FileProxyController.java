package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

/**
 * Generic download proxy for chat attachments ({@code /bot/file/{fileId}} —
 * nginx orqali public). Unlike {@link PhotoProxyController}, which whitelists
 * renderable image types, this endpoint always serves
 * {@code application/octet-stream} with an attachment disposition: the browser
 * downloads the file instead of rendering it, so a crafted HTML/SVG payload can
 * never execute in our origin.
 */
@Slf4j
@RestController
@RequestMapping("/bot/file")
@RequiredArgsConstructor
public class FileProxyController {

    private final TelegramApiClient telegram;

    @GetMapping("/{fileId}")
    public ResponseEntity<byte[]> file(@PathVariable String fileId,
                                       @RequestParam(value = "name", required = false) String name) {
        Optional<String> filePath = telegram.getFilePath(fileId);
        if (filePath.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fayl topilmadi");
        }
        Optional<byte[]> bytes = telegram.downloadFile(filePath.get());
        if (bytes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Faylni yuklab olishda xato");
        }

        String downloadName = sanitizeFilename(name, filePath.get());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename(downloadName, StandardCharsets.UTF_8)
                                .build()
                                .toString())
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePrivate())
                .body(bytes.get());
    }

    /**
     * The requested name is attacker-controlled — strip path separators and
     * control characters; fall back to the Telegram path's basename.
     */
    private static String sanitizeFilename(String requested, String telegramPath) {
        String candidate = requested;
        if (candidate == null || candidate.isBlank()) {
            int slash = telegramPath.lastIndexOf('/');
            candidate = slash >= 0 ? telegramPath.substring(slash + 1) : telegramPath;
        }
        String cleaned = candidate
                .replaceAll("[\\\\/\\p{Cntrl}]", "_")
                .trim();
        return cleaned.isBlank() ? "file" : cleaned;
    }
}
