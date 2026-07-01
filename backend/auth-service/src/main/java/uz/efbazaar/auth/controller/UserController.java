package uz.efbazaar.auth.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserResponse;
import uz.efbazaar.auth.mapper.UserMapper;
import uz.efbazaar.auth.security.AuthenticatedUser;
import uz.efbazaar.auth.security.TelegramFileClient;
import uz.efbazaar.auth.service.UserService;

import java.time.Duration;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserMapper userMapper;
    private final TelegramFileClient telegramFileClient;

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser principal) {
        return userMapper.toResponse(userService.getById(principal.userId()));
    }

    /**
     * Profile photo proxy — faqat bot media topic'ga upload qilgan {@code file_id}
     * orqali xizmat ko'rsatadi. Login Widget'ning {@code t.me/i/userpic} URL'lari
     * vaqt o'tishi bilan Telegram tomonidan cache-bust qilinadi, shuning uchun
     * ularni fallback qilmaslik — 302 → 404 zanjiri o'rniga aniq 404 qaytarish
     * yaxshiroq (frontend Radix Avatar initials fallback'ini toza ko'rsatadi).
     */
    @GetMapping("/me/photo")
    public ResponseEntity<byte[]> mePhoto(@AuthenticationPrincipal AuthenticatedUser principal) {
        User user = userService.getById(principal.userId());

        if (user.getTelegramPhotoFileId() == null || user.getTelegramPhotoFileId().isBlank()) {
            return ResponseEntity.notFound().build();
        }

        Optional<byte[]> bytes = telegramFileClient.fetchBytes(user.getTelegramPhotoFileId());
        if (bytes.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(bytes.get().length))
                .body(bytes.get());
    }
}
