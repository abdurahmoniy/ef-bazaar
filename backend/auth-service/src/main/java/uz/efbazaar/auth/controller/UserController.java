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

import java.net.URI;
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
     * Profile photo proxy.
     *
     * <ul>
     *   <li>Login Widget userlari uchun — Telegram CDN URL'i ({@code telegramPhotoUrl})
     *       to'g'ridan-to'g'ri 302 redirect (token yo'q, ochiq URL).</li>
     *   <li>Mini App userlari uchun — bot upload qilgan {@code file_id}'ni Telegram Bot API
     *       orqali stream qilamiz (URL bot token saqlaydi, frontend'ga ko'rsata olmaymiz).</li>
     *   <li>Hech qaysi manba yo'q bo'lsa — 404, frontend initial fallback ko'rsatadi.</li>
     * </ul>
     */
    @GetMapping("/me/photo")
    public ResponseEntity<byte[]> mePhoto(@AuthenticationPrincipal AuthenticatedUser principal) {
        User user = userService.getById(principal.userId());

        // file_id — primary source: bot uploaded media topic'ga, Telegram Bot API
        // orqali doim qaytib olish mumkin. Login Widget't.me/i/userpic URL'lari
        // vaqt o'tib stale bo'ladi (Telegram cache-busting), shuning uchun file_id
        // birinchi navbatda tekshiriladi.
        if (user.getTelegramPhotoFileId() != null && !user.getTelegramPhotoFileId().isBlank()) {
            Optional<byte[]> bytes = telegramFileClient.fetchBytes(user.getTelegramPhotoFileId());
            if (bytes.isPresent()) {
                return ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                        .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(bytes.get().length))
                        .body(bytes.get());
            }
        }

        // Fallback — eski Login Widget userlari uchun (file_id hali backfill bo'lmagan).
        if (user.getTelegramPhotoUrl() != null && !user.getTelegramPhotoUrl().isBlank()) {
            return ResponseEntity.status(302)
                    .location(URI.create(user.getTelegramPhotoUrl()))
                    .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                    .build();
        }

        return ResponseEntity.notFound().build();
    }
}
