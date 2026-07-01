package uz.efbazaar.auth.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;
import uz.efbazaar.auth.security.GoogleTokenVerifier;
import uz.efbazaar.auth.security.GoogleTokenVerifier.VerifiedGoogleIdentity;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GoogleOAuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock GoogleTokenVerifier verifier;
    @Mock AuthEventPublisher events;
    @Mock TokenIssuer tokenIssuer;
    @Mock UserService userService;

    @InjectMocks GoogleOAuthService service;

    private VerifiedGoogleIdentity identity;

    @BeforeEach
    void setUp() {
        identity = new VerifiedGoogleIdentity("google-sub-123", "shukhrat@example.com", "Shukhrat");
    }

    // ---------- login (register-or-login) ----------

    @Test
    void login_returnsExistingUserWhenGoogleIdMatches() {
        User existing = User.builder().id(UUID.randomUUID())
                .googleId("google-sub-123").email("old@example.com").role(Role.USER).build();
        when(verifier.verify("token")).thenReturn(identity);
        when(userRepository.findByGoogleId("google-sub-123")).thenReturn(Optional.of(existing));
        when(tokenIssuer.issue(existing)).thenReturn(new TokenResponse("acc", "ref", 900L, 2592000L, null));

        service.login("token");

        // Google email/given_name refreshed on login — user renamed themselves on Google.
        assertThat(existing.getEmail()).isEqualTo("shukhrat@example.com");
        assertThat(existing.getGoogleGivenName()).isEqualTo("Shukhrat");
        verify(events).userLoggedIn(existing.getId(), "google");
    }

    @Test
    void login_registersNewGoogleOnlyUserWhenGoogleIdUnknown() {
        when(verifier.verify("token")).thenReturn(identity);
        when(userRepository.findByGoogleId("google-sub-123")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });
        when(tokenIssuer.issue(any(User.class))).thenReturn(new TokenResponse("acc", "ref", 900L, 2592000L, null));

        service.login("token");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        User u = saved.getValue();
        assertThat(u.getGoogleId()).isEqualTo("google-sub-123");
        assertThat(u.getEmail()).isEqualTo("shukhrat@example.com");
        assertThat(u.getGoogleGivenName()).isEqualTo("Shukhrat");
        assertThat(u.getTelegramId()).isNull();       // Google-first — no Telegram yet
        assertThat(u.verified()).isFalse();           // not verified until Telegram is linked
        verify(events).userRegistered(u);
    }

    @Test
    void login_doesNotMergeByEmail() {
        // Telegram-only user with the same email exists. login() must NOT link
        // Google to that account — it belongs to a distinct signup path.
        User telegramUser = User.builder().id(UUID.randomUUID())
                .telegramId(999L).email("shukhrat@example.com").role(Role.USER).build();
        when(verifier.verify("token")).thenReturn(identity);
        when(userRepository.findByGoogleId("google-sub-123")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(tokenIssuer.issue(any(User.class))).thenReturn(new TokenResponse("acc", "ref", 900L, 2592000L, null));

        service.login("token");

        // A fresh Google-only account was created — telegramUser stays untouched.
        assertThat(telegramUser.getGoogleId()).isNull();
    }

    // ---------- link (from authenticated user) ----------

    @Test
    void link_attachesGoogleToTelegramUser() {
        UUID userId = UUID.randomUUID();
        User telegramUser = User.builder().id(userId).telegramId(999L).role(Role.USER).build();
        when(verifier.verify("token")).thenReturn(identity);
        when(userService.getById(userId)).thenReturn(telegramUser);
        when(userRepository.findByGoogleId("google-sub-123")).thenReturn(Optional.empty());

        service.link(userId, "token");

        assertThat(telegramUser.getGoogleId()).isEqualTo("google-sub-123");
        assertThat(telegramUser.getEmail()).isEqualTo("shukhrat@example.com");
        assertThat(telegramUser.verified()).isTrue();   // both identities now present
        verify(events).googleLinked(telegramUser);
    }

    @Test
    void link_rejectsWhenGoogleIdBelongsToAnotherUser() {
        UUID userId = UUID.randomUUID();
        User me = User.builder().id(userId).telegramId(999L).role(Role.USER).build();
        User other = User.builder().id(UUID.randomUUID())
                .googleId("google-sub-123").role(Role.USER).build();
        when(verifier.verify("token")).thenReturn(identity);
        when(userService.getById(userId)).thenReturn(me);
        when(userRepository.findByGoogleId("google-sub-123")).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> service.link(userId, "token"))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("boshqa foydalanuvchiga");
        assertThat(me.getGoogleId()).isNull();
    }

    @Test
    void link_rejectsWhenCurrentUserAlreadyHasDifferentGoogle() {
        UUID userId = UUID.randomUUID();
        User me = User.builder().id(userId).telegramId(999L)
                .googleId("existing-google").role(Role.USER).build();
        when(verifier.verify("token")).thenReturn(identity);
        when(userService.getById(userId)).thenReturn(me);

        assertThatThrownBy(() -> service.link(userId, "token"))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("allaqachon Google");
    }
}
