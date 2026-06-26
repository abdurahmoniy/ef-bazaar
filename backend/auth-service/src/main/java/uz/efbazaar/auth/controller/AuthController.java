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
import uz.efbazaar.auth.service.UserService;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final UserService userService;
    private final UserMapper userMapper;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
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

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser principal) {
        return userMapper.toResponse(userService.getById(principal.userId()));
    }

    @PostMapping("/telegram/link")
    public UserResponse linkTelegram(@AuthenticationPrincipal AuthenticatedUser principal,
                                     @Valid @RequestBody TelegramLinkRequest request) {
        return userMapper.toResponse(userService.linkTelegram(principal.userId(), request));
    }

    /**
     * Nginx auth_request endpoint.
     * Validates the access token (already done by {@code JwtAuthenticationFilter})
     * and surfaces the user identity as response headers for nginx to forward
     * to upstream services.
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
