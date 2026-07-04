package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.domain.AttachmentType;

import java.io.IOException;
import java.util.List;
import java.util.Locale;

/**
 * Validates and uploads chat attachments. Images ride the existing listing
 * photo pipeline ({@link MediaService} → bot {@code /upload} → rendered via
 * {@code /bot/photo}); documents and voice notes go through the bot's
 * {@code /upload-file} (Telegram document, original bytes preserved) and are
 * downloaded via {@code /bot/file}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatAttachmentService {

    /** Non-image files (documents, voice notes) — Telegram bot cap is 50MB, we stay well under. */
    private static final long MAX_FILE_BYTES = 10L * 1024 * 1024;

    /** Executable / script / markup extensions never accepted as chat files. */
    private static final List<String> BLOCKED_EXTENSIONS = List.of(
            "svg", "svgz", "html", "htm", "xhtml", "xml", "sh", "bat", "cmd",
            "exe", "js", "php", "jsp", "py", "rb", "pl", "jar", "msi", "com", "scr");

    private final MediaService mediaService;
    private final RestClient botClient;

    public record Uploaded(AttachmentType type, String fileId, String name, String mime, long size) {}

    /**
     * Uploads one attachment, choosing the pipeline from the declared type:
     * {@code image/*} (validated against magic bytes) → IMAGE; {@code audio/*}
     * with {@code voice=true} → VOICE; everything else → FILE.
     */
    public Uploaded upload(MultipartFile file, boolean voice) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fayl bo'sh");
        }
        String mime = file.getContentType() == null
                ? "application/octet-stream"
                : file.getContentType().toLowerCase(Locale.ROOT);
        String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";

        if (voice) {
            if (!mime.startsWith("audio/")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Ovozli xabar audio formatda bo'lishi kerak");
            }
            requireSize(file);
            return new Uploaded(AttachmentType.VOICE, uploadDocument(file, name),
                    name, mime, file.getSize());
        }

        if (mime.startsWith("image/")) {
            // Full listing-grade validation: declared type, extension, magic bytes.
            mediaService.validate(List.of(file));
            List<String> fileIds = mediaService.uploadToBot(List.of(file), null, null);
            return new Uploaded(AttachmentType.IMAGE, fileIds.get(0), name, mime, file.getSize());
        }

        requireExtensionAllowed(name);
        requireSize(file);
        return new Uploaded(AttachmentType.FILE, uploadDocument(file, name),
                name, mime, file.getSize());
    }

    private static void requireSize(MultipartFile file) {
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Fayl hajmi 10MB dan oshmasligi kerak");
        }
    }

    private static void requireExtensionAllowed(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        if (dot < 0) return;
        String ext = lower.substring(dot + 1);
        if (BLOCKED_EXTENSIONS.contains(ext)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ushbu fayl kengaytmasi ruxsat etilmagan: ." + ext);
        }
    }

    private String uploadDocument(MultipartFile file, String filename) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        try {
            Resource resource = new ByteArrayResource(file.getBytes()) {
                @Override public String getFilename() { return filename; }
            };
            form.add("file", resource);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Fayl o'qib bo'lmadi: " + filename);
        }

        FileUploadResponse response;
        try {
            response = botClient.post()
                    .uri("/bot/internal/media/upload-file")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form)
                    .retrieve()
                    .body(FileUploadResponse.class);
        } catch (RestClientResponseException e) {
            log.error("Bot file upload failed {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Telegramga yuklab bo'lmadi");
        }
        if (response == null || response.fileId() == null || response.fileId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Bot bo'sh javob qaytardi");
        }
        return response.fileId();
    }

    public record FileUploadResponse(String fileId, Integer messageId) {}
}
