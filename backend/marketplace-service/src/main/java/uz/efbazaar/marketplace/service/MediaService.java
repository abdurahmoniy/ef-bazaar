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
import java.util.List;

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
            if (mf.getContentType() == null
                    || !props.allowedTypes().contains(mf.getContentType().toLowerCase())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Faqat " + props.allowedTypes() + " formatlar ruxsat etilgan. Yuborildi: "
                                + mf.getContentType());
            }
        }
    }

    /**
     * Sends the media group to the bot with an optional caption on the first
     * photo. Returns the Telegram file_ids in the same order they were
     * uploaded.
     *
     * @throws ResponseStatusException 502 if the bot call fails or returns empty
     */
    public List<String> uploadToBot(List<MultipartFile> files, String caption) {
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
