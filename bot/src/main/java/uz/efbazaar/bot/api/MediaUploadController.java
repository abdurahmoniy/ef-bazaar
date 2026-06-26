package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.MediaFile;
import uz.efbazaar.bot.telegram.TelegramApiClient.UploadedPhoto;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Internal endpoint — marketplace-service multipart yuboradi.
 * Bot media topikiga {@code sendMediaGroup} qiladi va file_id larini qaytaradi.
 *
 * <p>Tashqaridan nginx orqali kelmaydi — internal docker network ichida.
 */
@Slf4j
@RestController
@RequestMapping("/bot/internal/media")
@RequiredArgsConstructor
public class MediaUploadController {

    private final TelegramApiClient telegram;
    private final TelegramProperties props;

    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.OK)
    public UploadResponse upload(@RequestParam("files") List<MultipartFile> files,
                                 @RequestParam(value = "caption", required = false) String caption) {
        if (files == null || files.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "files majburiy");
        }
        if (files.size() > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Maksimum 10 ta rasm yuborish mumkin");
        }

        List<MediaFile> mediaFiles = new ArrayList<>(files.size());
        for (MultipartFile mf : files) {
            try {
                mediaFiles.add(new MediaFile(
                        mf.getBytes(),
                        mf.getOriginalFilename() != null ? mf.getOriginalFilename() : "photo.jpg",
                        mf.getContentType()));
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Fayl o'qib bo'lmadi: " + mf.getOriginalFilename());
            }
        }

        List<UploadedPhoto> uploaded = telegram.sendMediaGroup(
                props.groupChatId(),
                props.topics().media(),
                mediaFiles,
                caption);

        if (uploaded.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Telegram ga yuklash muvaffaqiyatsiz tugadi");
        }
        log.info("Uploaded {} photos to media topic", uploaded.size());

        return new UploadResponse(
                uploaded.stream().map(UploadedPhoto::fileId).toList(),
                uploaded.stream().map(UploadedPhoto::messageId).toList());
    }

    public record UploadResponse(List<String> fileIds, List<Integer> messageIds) {}
}
