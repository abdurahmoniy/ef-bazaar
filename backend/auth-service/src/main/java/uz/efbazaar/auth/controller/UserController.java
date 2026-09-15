package uz.efbazaar.auth.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserResponse;
import uz.efbazaar.auth.mapper.UserMapper;
import uz.efbazaar.auth.security.AuthenticatedUser;
import uz.efbazaar.auth.security.TelegramFileClient;
import uz.efbazaar.auth.service.AccessGate;
import uz.efbazaar.auth.service.UserService;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserMapper userMapper;
    private final TelegramFileClient telegramFileClient;
    private final AccessGate accessGate;

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser principal) {
        return userMapper.toResponse(userService.getById(principal.userId()));
    }

    public record AccessStatus(boolean allowed) {}

    /**
     * Joriy sessiya kirish shartlarini hali ham bajaradimi. Mini App ochilganda
     * frontend so'raydi: sessiya bor odam login qilmaydi, shuning uchun
     * tekshiruv shu yerda bo'lmasa obunani bekor qilgan odam kirib yuraverardi.
     * Fail-open — AccessGate izohiga qarang.
     */
    @GetMapping("/me/access")
    public AccessStatus myAccess(@AuthenticationPrincipal AuthenticatedUser principal) {
        User user = userService.getById(principal.userId());
        return new AccessStatus(AccessGate.exempt(user) || accessGate.allows(user.getTelegramId()));
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
        if (principal == null) {
            // Belt and braces behind the security rule: a config that lets an
            // anonymous request through here should answer 401, not crash on a
            // null principal and report it as a server fault.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return streamPhoto(principal.userId(), false);
    }

    @GetMapping("/{id}/photo")
    public ResponseEntity<byte[]> userPhoto(@PathVariable UUID id) {
        return streamPhoto(id, true);
    }

    private ResponseEntity<byte[]> streamPhoto(UUID userId, boolean isPublic) {
        User user;
        try {
            user = userService.getById(userId);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }

        if (user.getTelegramPhotoFileId() == null || user.getTelegramPhotoFileId().isBlank()) {
            return ResponseEntity.notFound().build();
        }

        Optional<byte[]> bytes = telegramFileClient.fetchBytes(user.getTelegramPhotoFileId());
        if (bytes.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        CacheControl cacheControl = isPublic
                ? CacheControl.maxAge(Duration.ofHours(1)).cachePublic()
                : CacheControl.maxAge(Duration.ofHours(1)).cachePrivate();

        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .cacheControl(cacheControl)
                .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(bytes.get().length))
                .body(bytes.get());
    }

    /**
     * Hard-delete the current account. See {@link UserService#deleteById} for
     * the invariants — telegram/google identities are released so the same
     * user can sign up fresh afterwards, and downstream services are notified
     * via {@code efbazaar.auth.user-deleted} to purge their own state.
     */
    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMe(@AuthenticationPrincipal AuthenticatedUser principal) {
        userService.deleteById(principal.userId());
    }
}
