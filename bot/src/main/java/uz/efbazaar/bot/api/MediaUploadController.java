package uz.efbazaar.bot.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.kafka.MediaUploadedEvent;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.MediaFile;
import uz.efbazaar.bot.telegram.TelegramApiClient.UploadedPhoto;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Internal endpoint — marketplace-service multipart yuboradi.
 * Bot media topikiga {@code sendMediaGroup} qiladi va file_id larini qaytaradi.
 *
 * <p>Tashqaridan nginx orqali kelmaydi — internal docker network ichida.
 *
 * <p>Muvaffaqiyatli yuklashdan keyin har bir photo uchun bittadan
 * {@code efbazaar.bot.media-uploaded} Kafka event chiqaradi. Event chiqarilishi
 * best-effort — Kafka'ga yozish uddasidan chiqmasa ham HTTP javob 200 qaytadi,
 * chunki media topikida foto allaqachon bor va bu yerdagi failure downstream
 * analytics uchun degraded rejim.
 */
@Slf4j
@RestController
@RequestMapping("/bot/internal/media")
@RequiredArgsConstructor
public class MediaUploadController {

    private static final String TOPIC_MEDIA_UPLOADED = "efbazaar.bot.media-uploaded";
    private static final String DEFAULT_MEDIA_TYPE = "photo";

    private final TelegramApiClient telegram;
    private final TelegramProperties props;
    private final KafkaTemplate<String, Object> kafka;

    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.OK)
    public UploadResponse upload(@RequestParam("files") List<MultipartFile> files,
                                 @RequestParam(value = "caption", required = false) String caption,
                                 @RequestParam(value = "listingId", required = false) UUID listingId) {
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
        log.info("Uploaded {} photos to media topic (listingId={})", uploaded.size(), listingId);

        publishUploadedEvents(listingId, uploaded);

        return new UploadResponse(
                uploaded.stream().map(UploadedPhoto::fileId).toList(),
                uploaded.stream().map(UploadedPhoto::messageId).toList());
    }

    private void publishUploadedEvents(UUID listingId, List<UploadedPhoto> uploaded) {
        Instant now = Instant.now();
        String key = listingId != null ? listingId.toString() : null;
        for (UploadedPhoto photo : uploaded) {
            try {
                kafka.send(TOPIC_MEDIA_UPLOADED, key,
                        new MediaUploadedEvent(listingId, photo.messageId(), DEFAULT_MEDIA_TYPE, now));
            } catch (Exception ex) {
                // Kafka availability is not on the critical path here — the upload
                // itself already succeeded. Warn and move on.
                log.warn("Failed to publish media-uploaded event (listingId={} messageId={}): {}",
                        listingId, photo.messageId(), ex.getMessage());
            }
        }
    }

    public record UploadResponse(List<String> fileIds, List<Integer> messageIds) {}
}
