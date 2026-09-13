package uz.efbazaar.marketplace.guide;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;

/**
 * Qo'llanma videosini Telegram'ga yuklaydi va `file_id` ni qaytaradi.
 *
 * <p>Fayl bizda saqlanmaydi — loyihaning umumiy qoidasi. Yuklash bot
 * orqali ketadi, chunki bot tokeni faqat unda.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GuideVideoUploader {

    /**
     * Veb-saytda ijro etish uchun Telegram Bot API getFile limiti 20 MB.
     * 20 MB dan katta fayllar Telegram Bot API tomonidan "file is too big"
     * xatosi bilan rad etiladi va veb-brauzerda o'ynamaydi.
     */
    static final long MAX_BYTES = 20L * 1024 * 1024;

    @Qualifier("botClient")
    private final RestClient botClient;

    public UploadResponse upload(MultipartFile video, String caption) {
        if (video == null || video.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Video yuklanmagan");
        }
        if (video.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "Video 20 MB dan katta. Veb-saytda ijro etish uchun video 20 MB dan oshmasligi kerak. "
                            + "Iltimos, videoni MP4 formatda siqib qayta yuklang.");
        }

        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", resource(video));
        if (caption != null && !caption.isBlank()) form.add("caption", caption);

        try {
            UploadResponse response = botClient.post()
                    .uri("/bot/internal/media/upload-video")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form)
                    .retrieve()
                    .body(UploadResponse.class);
            if (response == null || response.fileId() == null || response.fileId().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "Telegram videoni qabul qilmadi");
            }
            return response;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Qo'llanma videosini yuklab bo'lmadi: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Videoni yuklab bo'lmadi: " + e.getMessage());
        }
    }

    /**
     * Faylni OQIM bilan uzatadi — bayt massiviga o'qimasdan.
     *
     * <p>{@code getBytes()} 50 MB ni heap'ga tortardi. marketplace heap'i
     * 320 MB, bot'niki esa atigi 160 MB va ikkalasi ham konteyner
     * chegarasiga yaqin ishlaydi — bunday o'qish OOM ga olib borardi, va
     * {@code -XX:+ExitOnOutOfMemoryError} bilan servis o'lardi.
     *
     * <p>Spring multipart faylni allaqachon DISKKA yozadi, ya'ni oqim
     * shundan o'qiladi va qo'shimcha nusxa umuman yaratilmaydi.
     */
    private static Resource resource(MultipartFile video) {
        String name = video.getOriginalFilename();
        String safe = name == null || name.isBlank() ? "guide.mp4" : name;
        return new InputStreamResource(openStream(video)) {
            @Override public String getFilename() { return safe; }
            // Content-Length berilmasa mijoz butun oqimni buferlab uzunlikni
            // o'lchardi — ya'ni aynan qochmoqchi bo'lgan narsamiz.
            @Override public long contentLength() { return video.getSize(); }
        };
    }

    private static InputStream openStream(MultipartFile video) {
        try {
            return video.getInputStream();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Faylni o'qib bo'lmadi");
        }
    }

    /**
     * @param mediaKind VIDEO yoki DOCUMENT. Telegram MP4 bo'lmagan faylni
     *                  document sifatida qabul qiladi va uni qayta yuborish
     *                  usuli boshqa.
     */
    public record UploadResponse(String fileId, Integer messageId, String mediaKind) {

        public String kindOrVideo() {
            return mediaKind == null || mediaKind.isBlank() ? "VIDEO" : mediaKind;
        }
    }
}
