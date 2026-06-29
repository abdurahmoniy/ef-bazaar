package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TelegramAuthRequest;
import uz.efbazaar.auth.dto.TelegramWebAppRequest;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;
import uz.efbazaar.auth.security.TelegramLoginValidator;
import uz.efbazaar.auth.security.TelegramWebAppValidator;

/**
 * Telegram register-or-login flow — supports two surfaces:
 * <ul>
 *   <li>{@link #authenticate(TelegramAuthRequest)} — browser Login Widget callback</li>
 *   <li>{@link #authenticateWebApp(TelegramWebAppRequest)} — Mini App {@code initData}</li>
 * </ul>
 * Both validate Telegram's signature, then share the same idempotent register-or-login
 * pipeline keyed by {@code telegram_id}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramAuthService {

    private final UserRepository userRepository;
    private final TelegramLoginValidator loginWidgetValidator;
    private final TelegramWebAppValidator webAppValidator;
    private final AuthEventPublisher events;
    private final TokenIssuer tokenIssuer;

    @Transactional
    public TokenResponse authenticate(TelegramAuthRequest req) {
        if (!loginWidgetValidator.isValid(req.toPayload())) {
            throw AuthException.invalidTelegramHash();
        }
        return registerOrLogin(new TelegramProfile(
                req.id(), req.firstName(), req.lastName(), req.username(), req.photoUrl()));
    }

    @Transactional
    public TokenResponse authenticateWebApp(TelegramWebAppRequest req) {
        TelegramProfile profile = webAppValidator.validate(req.initData())
                .orElseThrow(AuthException::invalidTelegramHash);
        return registerOrLogin(profile);
    }

    private TokenResponse registerOrLogin(TelegramProfile profile) {
        return userRepository.findByTelegramId(profile.id())
                .map(existing -> loginExisting(existing, profile))
                .orElseGet(() -> registerNew(profile));
    }

    private TokenResponse loginExisting(User user, TelegramProfile profile) {
        // Refresh denormalized Telegram profile in case the user changed it.
        user.setTelegramUsername(profile.username());
        user.setTelegramFirstName(profile.firstName());
        user.setTelegramLastName(profile.lastName());
        // Only overwrite stored photo URL if Telegram is currently providing one;
        // Mini App initData often omits it, and we'd otherwise nuke an existing avatar.
        if (profile.photoUrl() != null && !profile.photoUrl().isBlank()) {
            user.setTelegramPhotoUrl(profile.photoUrl());
        }
        events.userLoggedIn(user.getId(), "telegram");

        // Photo sync — har login'da publish qilamiz, event ichida hozir saqlangan
        // file_unique_id'ni o'tkazamiz. Bot Telegram'dagi joriy rasmni o'sha bilan
        // solishtiradi: o'zgarmagan bo'lsa skip (media topic'ga qayta upload
        // qilinmaydi), o'zgargan yoki yo'q bo'lsa — yangi upload + DB update.
        // Bot consumer async, login response kechikmaydi.
        events.userPhotoNeeded(user);

        return tokenIssuer.issue(user);
    }

    private TokenResponse registerNew(TelegramProfile profile) {
        User user = User.builder()
                .telegramId(profile.id())
                .telegramUsername(profile.username())
                .telegramFirstName(profile.firstName())
                .telegramLastName(profile.lastName())
                .telegramPhotoUrl(profile.photoUrl())
                .role(Role.USER)
                .build();
        user = userRepository.save(user);
        log.info("User registered via Telegram: id={} telegramId={}", user.getId(), user.getTelegramId());
        events.userRegistered(user);
        return tokenIssuer.issue(user);
    }
}
