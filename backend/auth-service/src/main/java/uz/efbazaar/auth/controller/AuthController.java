package uz.efbazaar.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.auth.dto.*;
import uz.efbazaar.auth.mapper.UserMapper;
import uz.efbazaar.auth.security.AuthenticatedUser;
import uz.efbazaar.auth.service.AuthService;
import uz.efbazaar.auth.service.GoogleOAuthService;
import uz.efbazaar.auth.service.TelegramAuthService;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final TelegramAuthService telegramAuthService;
    private final GoogleOAuthService googleOAuthService;
    private final UserMapper userMapper;

    /** Telegram register-or-login. Idempotent by telegram_id. */
    @PostMapping("/telegram")
    public TokenResponse telegram(@Valid @RequestBody TelegramAuthRequest request) {
        return telegramAuthService.authenticate(request);
    }

    /**
     * Link Telegram identity to the currently authenticated (Google-first) user.
     * Rejects if the caller already has Telegram attached or if this Telegram id
     * is already used by another account.
     */
    @PostMapping("/telegram/link")
    public UserResponse telegramLink(@AuthenticationPrincipal AuthenticatedUser principal,
                                     @Valid @RequestBody TelegramAuthRequest request) {
        return userMapper.toResponse(telegramAuthService.link(principal.userId(), request));
    }

    /**
     * Telegram Mini App auto-login. Accepts the raw {@code window.Telegram.WebApp.initData}
     * query string and validates the HMAC signature server-side. Same register-or-login
     * pipeline as {@link #telegram} — idempotent by {@code telegram_id}.
     */
    @PostMapping("/telegram-webapp")
    public TokenResponse telegramWebApp(@Valid @RequestBody TelegramWebAppRequest request) {
        return telegramAuthService.authenticateWebApp(request);
    }

    /** Google-only login. Returns 404 GOOGLE_NOT_LINKED if no user has this google_id. */
    @PostMapping("/google/login")
    public TokenResponse googleLogin(@Valid @RequestBody GoogleAuthRequest request) {
        return googleOAuthService.login(request.idToken());
    }

    /** Link Google identity to the currently authenticated user. Sets verified=true. */
    @PostMapping("/google/link")
    public UserResponse googleLink(@AuthenticationPrincipal AuthenticatedUser principal,
                                   @Valid @RequestBody GoogleAuthRequest request) {
        return userMapper.toResponse(googleOAuthService.link(principal.userId(), request.idToken()));
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return authService.refresh(request);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody LogoutRequest request) {
        authService.logout(request.refreshToken());
    }

    /**
     * Nginx auth_request endpoint — validates the access token and surfaces
     * the user identity as response headers for upstream services.
     */
    @GetMapping("/verify")
    public ResponseEntity<Void> verify(@AuthenticationPrincipal AuthenticatedUser principal) {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-User-Id", principal.userId().toString());
        headers.add("X-User-Roles", String.join(",", principal.roles()));
        if (principal.telegramId() != null) {
            headers.add("X-Telegram-Id", principal.telegramId().toString());
        }
        return ResponseEntity.noContent().headers(headers).build();
    }
}
