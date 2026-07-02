package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
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
     *
     * <p>Rejects with {@code googleAlreadyLinked} when the {@code googleId}
     * is already attached to a different account — merging is intentionally
     * disallowed. The caller keeps their existing account; the second Google
     * identity is left untouched. {@code verified} is a computed property on
     * {@link User#verified()} so we no longer flip a boolean here.
     */
    @Transactional
    public User link(UUID userId, String idToken) {
        VerifiedGoogleIdentity identity = verifier.verify(idToken);
        User user = userService.getById(userId);

        // If the user already has Google, they can't swap it out — re-linking a
        // different Google identity from the profile page silently would surprise
        // the user. Idempotent no-op when the same identity is presented.
        if (user.getGoogleId() != null && !user.getGoogleId().equals(identity.googleId())) {
            throw AuthException.googleAlreadyOwned();
        }
        userRepository.findByGoogleId(identity.googleId()).ifPresent(other -> {
            if (!other.getId().equals(userId)) {
                throw AuthException.googleAlreadyLinked();
            }
        });

        user.setGoogleId(identity.googleId());
        user.setEmail(identity.email());
        if (identity.givenName() != null && !identity.givenName().isBlank()) {
            user.setGoogleGivenName(identity.givenName());
        }

        events.googleLinked(user);
        log.info("Google linked: userId={} email={}", user.getId(), identity.email());
        return user;
    }

    /**
     * Google login — register-or-login by {@code googleId}. If no user has
     * this Google identity yet, a fresh Google-first account is created
     * ({@code telegramId=null}). No email-based merge with existing
     * Telegram-only users — those stay separate accounts by design. The user
     * gets {@code verified} only after they explicitly link Telegram to this
     * new account via {@link TelegramAuthService#link}.
     */
    @Transactional
    public TokenResponse login(String idToken) {
        VerifiedGoogleIdentity identity = verifier.verify(idToken);
        return userRepository.findByGoogleId(identity.googleId())
                .map(existing -> loginExisting(existing, identity))
                .orElseGet(() -> registerNew(identity));
    }

    private TokenResponse loginExisting(User user, VerifiedGoogleIdentity identity) {
        // Keep denormalized Google profile fresh — email/given_name can change
        // if the user renamed themselves on Google.
        if (identity.email() != null) user.setEmail(identity.email());
        if (identity.givenName() != null && !identity.givenName().isBlank()) {
            user.setGoogleGivenName(identity.givenName());
        }
        events.userLoggedIn(user.getId(), "google");
        return tokenIssuer.issue(user);
    }

    private TokenResponse registerNew(VerifiedGoogleIdentity identity) {
        User user = User.builder()
                .googleId(identity.googleId())
                .email(identity.email())
                .googleGivenName(identity.givenName())
                .role(Role.USER)
                .build();
        user = userRepository.save(user);
        log.info("User registered via Google: id={} email={}", user.getId(), identity.email());
        events.userRegistered(user);
        return tokenIssuer.issue(user);
    }
}
