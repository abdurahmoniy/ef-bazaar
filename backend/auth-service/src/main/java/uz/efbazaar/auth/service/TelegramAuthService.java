package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TelegramAuthRequest;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;
import uz.efbazaar.auth.security.TelegramLoginValidator;

/**
 * Telegram register-or-login flow.
 * <p>The endpoint is idempotent: if a user with the given telegram_id exists we log them
 * in; otherwise we create the account from the Telegram payload and log them in.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramAuthService {

    private final UserRepository userRepository;
    private final TelegramLoginValidator validator;
    private final AuthEventPublisher events;
    private final TokenIssuer tokenIssuer;

    @Transactional
    public TokenResponse authenticate(TelegramAuthRequest req) {
        if (!validator.isValid(req.toPayload())) {
            throw AuthException.invalidTelegramHash();
        }

        return userRepository.findByTelegramId(req.id())
                .map(existing -> loginExisting(existing, req))
                .orElseGet(() -> registerNew(req));
    }

    private TokenResponse loginExisting(User user, TelegramAuthRequest req) {
        // Refresh denormalized Telegram profile in case the user changed it.
        user.setTelegramUsername(req.username());
        user.setTelegramFirstName(req.firstName());
        user.setTelegramLastName(req.lastName());
        user.setTelegramPhotoUrl(req.photoUrl());
        events.userLoggedIn(user.getId(), "telegram");
        return tokenIssuer.issue(user);
    }

    private TokenResponse registerNew(TelegramAuthRequest req) {
        User user = User.builder()
                .telegramId(req.id())
                .telegramUsername(req.username())
                .telegramFirstName(req.firstName())
                .telegramLastName(req.lastName())
                .telegramPhotoUrl(req.photoUrl())
                .role(Role.USER)
                .build();
        user = userRepository.save(user);
        log.info("User registered via Telegram: id={} telegramId={}", user.getId(), user.getTelegramId());
        events.userRegistered(user);
        return tokenIssuer.issue(user);
    }
}
