package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;
import uz.efbazaar.auth.security.GoogleTokenVerifier;
import uz.efbazaar.auth.security.GoogleTokenVerifier.VerifiedGoogleIdentity;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class GoogleOAuthService {

    private final UserRepository userRepository;
    private final GoogleTokenVerifier verifier;
    private final AuthEventPublisher events;
    private final TokenIssuer tokenIssuer;
    private final UserService userService;

    /**
     * Link Google identity to the currently authenticated user.
     * Sets {@code googleId} + {@code email} and marks the account verified.
     */
    @Transactional
    public User link(UUID userId, String idToken) {
        VerifiedGoogleIdentity identity = verifier.verify(idToken);
        User user = userService.getById(userId);

        userRepository.findByGoogleId(identity.googleId()).ifPresent(other -> {
            if (!other.getId().equals(userId)) {
                throw AuthException.googleAlreadyLinked();
            }
        });

        user.setGoogleId(identity.googleId());
        user.setEmail(identity.email());
        user.setVerified(true);

        events.googleLinked(user);
        log.info("Google linked: userId={} email={}", user.getId(), identity.email());
        return user;
    }

    /**
     * Google-only login. Fails with {@code GOOGLE_NOT_LINKED} if no user
     * has linked this Google account — the client should then suggest
     * Telegram login + profile linking.
     */
    @Transactional
    public TokenResponse login(String idToken) {
        VerifiedGoogleIdentity identity = verifier.verify(idToken);
        User user = userRepository.findByGoogleId(identity.googleId())
                .orElseThrow(AuthException::googleNotLinked);
        events.userLoggedIn(user.getId(), "google");
        return tokenIssuer.issue(user);
    }
}
