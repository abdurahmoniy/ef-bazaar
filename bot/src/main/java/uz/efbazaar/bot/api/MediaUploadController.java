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

    /**
     * Single-file upload as a Telegram DOCUMENT — original bytes preserved
     * (no photo recompression). Used by marketplace-service for chat file
     * and voice attachments. No Kafka event: chat media is not part of the
     * listing analytics stream.
     */
    @PostMapping(value = "/upload-file", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.OK)
    public FileUploadResponse uploadFile(@RequestParam("file") MultipartFile file,
                                         @RequestParam(value = "caption", required = false) String caption) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file majburiy");
        }
        MediaFile mediaFile;
        try {
            mediaFile = new MediaFile(
                    file.getBytes(),
                    file.getOriginalFilename() != null ? file.getOriginalFilename() : "file",
                    file.getContentType());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Fayl o'qib bo'lmadi: " + file.getOriginalFilename());
        }

        var uploaded = telegram.sendDocument(
                props.groupChatId(), props.topics().media(), mediaFile, caption);
        if (uploaded.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Telegram ga yuklash muvaffaqiyatsiz tugadi");
        }
        log.info("Uploaded document to media topic: messageId={}", uploaded.get().messageId());
        return new FileUploadResponse(uploaded.get().fileId(), uploaded.get().messageId());
    }

    /**
     * Video sifatida yuklash — qo'llanmalar uchun.
     *
     * <p>{@code upload-file} dan farqi: u document yuboradi va klient uni
     * FAYL qilib ko'rsatadi, bosib yuklab olish kerak. Video esa chat ichida
     * o'ynaydi va Telegram uni o'z kompressori bilan siqadi.
     *
     * <p>Media topikiga tushadi va o'sha yerda qoladi: `file_id` faqat
     * Telegram'da xabar mavjud ekan amal qiladi, ya'ni uni o'chirish
     * qo'llanmani yo'q qilardi.
     */
    @PostMapping(value = "/upload-video", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.OK)
    public VideoUploadResponse uploadVideo(@RequestParam("file") MultipartFile file,
                                          @RequestParam(value = "caption", required = false)
                                          String caption) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file majburiy");
        }
        // getBytes() ATAYLAB ishlatilmaydi: u 50 MB ni heap'ga tortadi va
        // bot heap'i 160 MB. Spring multipart faylni allaqachon diskka
        // yozgan, resurs esa o'shandan oqim bilan o'qiydi.
        var uploaded = telegram.sendVideo(
                props.groupChatId(), props.topics().media(),
                namedResource(file), caption);
        if (uploaded.isEmpty()) {
            // Eng ko'p uchraydigan sabab — 50 MB chegarasi. Bot API bundan
            // kattasini qabul qilmaydi va xabar shuni aytishi kerak, aks
            // holda admin sababni topa olmaydi.
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Telegram videoni qabul qilmadi. Eng ko'p uchraydigan sabab — "
                            + "hajm 50 MB dan katta.");
        }
        log.info("Uploaded video to media topic: messageId={} asVideo={}",
                uploaded.get().messageId(), uploaded.get().asVideo());
        return new VideoUploadResponse(uploaded.get().fileId(), uploaded.get().messageId(),
                uploaded.get().asVideo() ? "VIDEO" : "DOCUMENT");
    }

    /**
     * @param mediaKind VIDEO yoki DOCUMENT — qayta yuborishda usul shunga
     *                  qarab tanlanadi. Document id'sini `sendVideo` ga
     *                  bersak Telegram rad etadi.
     */
    public record VideoUploadResponse(String fileId, Integer messageId, String mediaKind) {}

    public record UploadResponse(List<String> fileIds, List<Integer> messageIds) {}

    /**
     * Multipart faylning resursi, nomi kafolatlangan holda.
     *
     * <p>Telegram multipart qismida FAYL NOMI bo'lishini talab qiladi;
     * nomsiz qism oddiy maydon deb qabul qilinadi va video yuklanmaydi.
     */
    private static org.springframework.core.io.Resource namedResource(MultipartFile file) {
        String name = file.getOriginalFilename();
        String safe = name == null || name.isBlank() ? "video.mp4" : name;
        return new org.springframework.core.io.InputStreamResource(openStream(file)) {
            @Override public String getFilename() { return safe; }
            @Override public long contentLength() { return file.getSize(); }
        };
    }

    private static java.io.InputStream openStream(MultipartFile file) {
        try {
            return file.getInputStream();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Faylni o'qib bo'lmadi: " + file.getOriginalFilename());
        }
    }

    public record FileUploadResponse(String fileId, int messageId) {}
}
