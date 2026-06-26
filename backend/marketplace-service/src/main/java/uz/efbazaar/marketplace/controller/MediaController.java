package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.MediaService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/listings/{id}/media")
@RequiredArgsConstructor
public class MediaController {

    private final MediaService mediaService;

    @PostMapping(consumes = "multipart/form-data")
    public MediaUploadResponse upload(@AuthenticationPrincipal AuthenticatedUser user,
                                      @PathVariable UUID id,
                                      @RequestPart("files") List<MultipartFile> files) {
        List<String> fileIds = mediaService.uploadMedia(id, user.userId(), files);
        return new MediaUploadResponse(id, fileIds);
    }

    public record MediaUploadResponse(UUID listingId, List<String> mediaMessageIds) {}
}
