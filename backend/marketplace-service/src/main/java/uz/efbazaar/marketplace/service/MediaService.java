package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.config.MediaProperties;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class MediaService {

    private final ListingRepository listings;
    private final MediaProperties props;
    private final RestClient botClient;

    @Transactional
    public List<String> uploadMedia(UUID listingId, UUID sellerId, List<MultipartFile> files) {
        Listing listing = listings.findById(listingId)
                .orElseThrow(MarketplaceException::listingNotFound);
        if (!listing.getSellerId().equals(sellerId)) {
            throw MarketplaceException.notOwner();
        }

        validate(files);

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

        listing.setMediaMessageIds(response.fileIds());
        log.info("Listing {} updated with {} media files", listingId, response.fileIds().size());
        return response.fileIds();
    }

    // ----- validation -----

    private void validate(List<MultipartFile> files) {
        if (files.size() < props.minFiles() || files.size() > props.maxFiles()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    String.format("Rasm soni %d dan %d gacha bo'lishi kerak (yuborildi: %d)",
                            props.minFiles(), props.maxFiles(), files.size()));
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

    public record UploadResponse(List<String> fileIds, List<Integer> messageIds) {}
}
