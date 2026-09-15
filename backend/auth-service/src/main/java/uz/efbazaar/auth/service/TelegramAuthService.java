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
    private final AccessGate accessGate;

    @Transactional
    public TokenResponse authenticate(TelegramAuthRequest req) {
        if (!loginWidgetValidator.isValid(req.toPayload())) {
            throw AuthException.invalidTelegramHash();
        }
        TelegramProfile profile = new TelegramProfile(
                req.id(), req.firstName(), req.lastName(), req.username(), req.photoUrl());
        ensureAccess(profile.id());
        return registerOrLogin(profile);
    }

    @Transactional
    public TokenResponse authenticateWebApp(TelegramWebAppRequest req) {
        TelegramProfile profile = webAppValidator.validate(req.initData())
                .orElseThrow(AuthException::invalidTelegramHash);
        ensureAccess(profile.id());
        return registerOrLogin(profile);
    }

    /**
     * Kirish shartlari — imzo tekshirilgandan KEYIN (soxta telegram id bilan
     * kanal a'zoligini so'rab bo'lmasin) va foydalanuvchi yaratilishidan OLDIN
     * (shartni bajarmagan odam bazaga tushmasin).
     *
     * <p>Adminlar tekshirilmaydi: sharoit noto'g'ri sozlansa (masalan admin
     * o'zi obuna bo'lmagan kanal qo'shsa) panelga kirib uni tuzata olishi kerak.
     */
    private void ensureAccess(long telegramId) {
        boolean admin = userRepository.findByTelegramId(telegramId)
                .map(user -> user.getRole() == Role.ADMIN)
                .orElse(false);
        if (admin) return;
        if (!accessGate.allows(telegramId)) {
            throw AuthException.accessRequirementsUnmet();
        }
    }

    /**
     * Link a Telegram identity to the currently authenticated (Google-first)
     * user. Rejects when:
     * <ul>
     *   <li>the caller already has Telegram attached — swap-in isn't allowed;</li>
     *   <li>the Telegram id is already attached to another account —
     *       merging is intentionally disallowed, that's a distinct account.</li>
     * </ul>
     * Same signature as {@link #authenticate} for the widget payload.
     */
    @Transactional
    public User link(java.util.UUID userId, TelegramAuthRequest req) {
        if (!loginWidgetValidator.isValid(req.toPayload())) {
            throw AuthException.invalidTelegramHash();
        }
        TelegramProfile profile = new TelegramProfile(
                req.id(), req.firstName(), req.lastName(), req.username(), req.photoUrl());
        return doLink(userId, profile);
    }

    private User doLink(java.util.UUID userId, TelegramProfile profile) {
        User user = userRepository.findById(userId).orElseThrow(AuthException::userNotFound);
        if (user.getTelegramId() != null && !user.getTelegramId().equals(profile.id())) {
            throw AuthException.telegramAlreadyOwned();
        }
        userRepository.findByTelegramId(profile.id()).ifPresent(other -> {
            if (!other.getId().equals(userId)) {
                throw AuthException.telegramAlreadyLinked();
            }
        });

        user.setTelegramId(profile.id());
        user.setTelegramUsername(profile.username());
        user.setTelegramFirstName(profile.firstName());
        user.setTelegramLastName(profile.lastName());
        if (profile.photoUrl() != null && !profile.photoUrl().isBlank()) {
            user.setTelegramPhotoUrl(profile.photoUrl());
        }
        // Kick off the same photo sync path as a login — bot mirrors the profile
        // picture to the media topic and stores file_id, so verified accounts get
        // the same avatar UX regardless of which side signed up first.
        events.userPhotoNeeded(user);
        log.info("Telegram linked: userId={} telegramId={}", user.getId(), profile.id());
        return user;
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
