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
import uz.efbazaar.marketplace.config.MediaProperties;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Uploads a media group to the bot's Telegram media topic. Callers are
 * responsible for the transactional context around persisting the returned
 * fileIds — this service intentionally does no DB work so the external I/O
 * stays outside any JPA transaction.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MediaService {

    private final MediaProperties props;
    private final RestClient botClient;

    /**
     * Payload-shape validation only: size/type/count. No DB access. Called
     * BEFORE {@link #uploadToBot} so bad requests don't reach Telegram.
     *
     * <p>Content-Type check is a fast rejection — a spoofed header still gets
     * further vetted by {@link FileTypeGuard} against the actual leading bytes,
     * so a bash script labelled {@code image/jpeg} is caught here.
     */
    public void validate(List<MultipartFile> files) {
        if (files == null || files.size() < props.minFiles() || files.size() > props.maxFiles()) {
            int actual = files == null ? 0 : files.size();
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    String.format("Rasm soni %d dan %d gacha bo'lishi kerak (yuborildi: %d)",
                            props.minFiles(), props.maxFiles(), actual));
        }
        for (MultipartFile mf : files) {
            if (mf.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bo'sh fayl");
            }
            if (mf.getSize() > props.maxFileSizeBytes()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        String.format("Fayl hajmi %dMB dan oshib ketdi: %s",
                                props.maxFileSizeMb(), mf.getOriginalFilename()));
            }
            String declared = mf.getContentType() == null
                    ? null : mf.getContentType().toLowerCase(Locale.ROOT);
            if (declared == null || !props.allowedTypes().contains(declared)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Faqat " + props.allowedTypes() + " formatlar ruxsat etilgan. Yuborildi: "
                                + mf.getContentType());
            }
            requireExtensionMatch(mf.getOriginalFilename(), declared);
            verifyMagicBytes(mf, declared);
        }
    }

    /**
     * Reads {@link FileTypeGuard#SNIFF_BYTES} from the head of the file and
     * hands them to {@link FileTypeGuard} for signature matching. Rejects with
     * 400 if the payload does not match any accepted image format or the sniff
     * disagrees with the declared Content-Type.
     */
    private void verifyMagicBytes(MultipartFile mf, String declaredContentType) {
        byte[] head = new byte[FileTypeGuard.SNIFF_BYTES];
        int read;
        try (InputStream in = mf.getInputStream()) {
            read = in.readNBytes(head, 0, head.length);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Faylni o'qib bo'lmadi: " + mf.getOriginalFilename());
        }
        if (read < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Fayl juda kichik: " + mf.getOriginalFilename());
        }
        byte[] sniff = (read == head.length) ? head : java.util.Arrays.copyOf(head, read);
        try {
            FileTypeGuard.requireAllowed(sniff, declaredContentType, props.allowedTypes());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    e.getMessage() + " (" + mf.getOriginalFilename() + ")");
        }
    }

    /**
     * Filename is attacker-controlled but still worth cross-checking — e.g.
     * a {@code .svg} extension is a strong signal even if Content-Type claims
     * something else. Blocks known-dangerous extensions outright and keeps the
     * remaining check narrow.
     */
    private static void requireExtensionMatch(String filename, String declaredContentType) {
        if (filename == null) return;
        String lower = filename.toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        if (dot < 0) return;
        String ext = lower.substring(dot + 1);
        // Executable / script / markup extensions never allowed on the media path.
        if (List.of("svg", "svgz", "html", "htm", "xhtml", "xml", "sh", "bat", "cmd",
                    "exe", "js", "php", "jsp", "py", "rb", "pl").contains(ext)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Ushbu fayl kengaytmasi ruxsat etilmagan: ." + ext);
        }
        boolean match = switch (declaredContentType) {
            case "image/jpeg" -> ext.equals("jpg") || ext.equals("jpeg");
            case "image/png"  -> ext.equals("png");
            case "image/webp" -> ext.equals("webp");
            case "image/heic", "image/heif" -> ext.equals("heic") || ext.equals("heif");
            default -> true;   // unknown declared type — magic byte check will decide
        };
        if (!match) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Fayl kengaytmasi Content-Type'ga mos kelmadi: " + filename);
        }
    }

    /**
     * Sends the media group to the bot with an optional caption on the first
     * photo. Returns the Telegram file_ids in the same order they were
     * uploaded.
     *
     * <p>The {@code listingId} is threaded through so the bot can emit
     * {@code efbazaar.bot.media-uploaded} events correlated to the listing.
     * Pass {@code null} for external callers that don't own a listing yet.
     *
     * @throws ResponseStatusException 502 if the bot call fails or returns empty
     */
    public List<String> uploadToBot(List<MultipartFile> files, String caption, UUID listingId) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        for (MultipartFile mf : files) {
            try {
                Resource resource = new ByteArrayResource(mf.getBytes()) {
                    @Override public String getFilename() {
                        return mf.getOriginalFilename() != null ? mf.getOriginalFilename() : "photo.jpg";
                    }
                };
                form.add("files", resource);
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Fayl o'qib bo'lmadi: " + mf.getOriginalFilename());
            }
        }
        if (caption != null && !caption.isBlank()) {
            form.add("caption", caption);
        }
        if (listingId != null) {
            form.add("listingId", listingId.toString());
        }

        UploadResponse response;
        try {
            response = botClient.post()
                    .uri("/bot/internal/media/upload")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form)
                    .retrieve()
                    .body(UploadResponse.class);
        } catch (RestClientResponseException e) {
            log.error("Bot media upload failed {} {}",
                    e.getStatusCode(), e.getResponseBodyAsString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Telegramga yuklab bo'lmadi");
        }
        if (response == null || response.fileIds() == null || response.fileIds().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Bot bo'sh javob qaytardi");
        }
        return response.fileIds();
    }

    public record UploadResponse(List<String> fileIds, List<Integer> messageIds) {}
}
