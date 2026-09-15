package uz.efbazaar.auth.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TelegramAuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock TelegramLoginValidator loginWidgetValidator;
    @Mock TelegramWebAppValidator webAppValidator;
    @Mock AuthEventPublisher events;
    @Mock TokenIssuer tokenIssuer;
    @Mock AccessGate accessGate;

    @InjectMocks TelegramAuthService service;

    private TelegramAuthRequest widgetRequest;

    @BeforeEach
    void setUp() {
        widgetRequest = new TelegramAuthRequest(
                123L, "Shukhrat", "Bozorov", "shukhrat",
                "https://t.me/i/photo.jpg", 1_700_000_000L, "hash-stub");
    }

    // ---------- link ----------

    @Test
    void link_attachesTelegramToGoogleUser() {
        UUID userId = UUID.randomUUID();
        User googleUser = User.builder().id(userId)
                .googleId("google-sub").email("shukhrat@example.com").role(Role.USER).build();
        when(loginWidgetValidator.isValid(anyMap())).thenReturn(true);
        when(userRepository.findById(userId)).thenReturn(Optional.of(googleUser));
        when(userRepository.findByTelegramId(123L)).thenReturn(Optional.empty());

        service.link(userId, widgetRequest);

        assertThat(googleUser.getTelegramId()).isEqualTo(123L);
        assertThat(googleUser.getTelegramFirstName()).isEqualTo("Shukhrat");
        assertThat(googleUser.getTelegramLastName()).isEqualTo("Bozorov");
        assertThat(googleUser.getTelegramUsername()).isEqualTo("shukhrat");
        assertThat(googleUser.verified()).isTrue();
    }

    @Test
    void link_rejectsWhenTelegramIdBelongsToAnotherUser() {
        UUID userId = UUID.randomUUID();
        User me = User.builder().id(userId).googleId("google-sub").role(Role.USER).build();
        User other = User.builder().id(UUID.randomUUID()).telegramId(123L).role(Role.USER).build();
        when(loginWidgetValidator.isValid(anyMap())).thenReturn(true);
        when(userRepository.findById(userId)).thenReturn(Optional.of(me));
        when(userRepository.findByTelegramId(123L)).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> service.link(userId, widgetRequest))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("boshqa foydalanuvchiga");
        assertThat(me.getTelegramId()).isNull();
    }

    @Test
    void link_rejectsWhenCurrentUserAlreadyHasDifferentTelegram() {
        UUID userId = UUID.randomUUID();
        User me = User.builder().id(userId).googleId("google-sub").telegramId(999L).role(Role.USER).build();
        when(loginWidgetValidator.isValid(anyMap())).thenReturn(true);
        when(userRepository.findById(userId)).thenReturn(Optional.of(me));

        assertThatThrownBy(() -> service.link(userId, widgetRequest))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("allaqachon Telegram");
    }

    @Test
    void link_rejectsInvalidHmac() {
        when(loginWidgetValidator.isValid(anyMap())).thenReturn(false);

        assertThatThrownBy(() -> service.link(UUID.randomUUID(), widgetRequest))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("noto'g'ri");
    }

    // ---------- access requirements ----------

    @Test
    void webApp_rejectsBeforeRegistering_whenAccessRequirementsUnmet() {
        when(webAppValidator.validate("init")).thenReturn(Optional.of(profile()));
        when(userRepository.findByTelegramId(123L)).thenReturn(Optional.empty());
        when(accessGate.allows(123L)).thenReturn(false);

        assertThatThrownBy(() -> service.authenticateWebApp(new TelegramWebAppRequest("init")))
                .isInstanceOf(AuthException.class)
                .extracting("code").isEqualTo("ACCESS_REQUIREMENTS_UNMET");
        verify(userRepository, never()).save(any());
        verify(tokenIssuer, never()).issue(any());
    }

    @Test
    void widget_rejects_whenAccessRequirementsUnmet() {
        when(loginWidgetValidator.isValid(anyMap())).thenReturn(true);
        when(userRepository.findByTelegramId(123L)).thenReturn(Optional.empty());
        when(accessGate.allows(123L)).thenReturn(false);

        assertThatThrownBy(() -> service.authenticate(widgetRequest))
                .extracting("code").isEqualTo("ACCESS_REQUIREMENTS_UNMET");
    }

    @Test
    void webApp_logsIn_whenAccessRequirementsMet() {
        User user = User.builder().id(UUID.randomUUID()).telegramId(123L).role(Role.USER).build();
        when(webAppValidator.validate("init")).thenReturn(Optional.of(profile()));
        when(userRepository.findByTelegramId(123L)).thenReturn(Optional.of(user));
        when(accessGate.allows(123L)).thenReturn(true);
        when(tokenIssuer.issue(user)).thenReturn(TOKENS);

        service.authenticateWebApp(new TelegramWebAppRequest("init"));

        verify(tokenIssuer).issue(user);
    }

    @Test
    void webApp_skipsAccessCheck_forAdmins() {
        User admin = User.builder().id(UUID.randomUUID()).telegramId(123L).role(Role.ADMIN).build();
        when(webAppValidator.validate("init")).thenReturn(Optional.of(profile()));
        when(userRepository.findByTelegramId(123L)).thenReturn(Optional.of(admin));
        when(tokenIssuer.issue(admin)).thenReturn(TOKENS);

        service.authenticateWebApp(new TelegramWebAppRequest("init"));

        verify(accessGate, never()).allows(123L);
        verify(tokenIssuer).issue(admin);
    }

    // registerOrLogin() Optional.map ichida — null token "user yo'q" deb o'qilardi.
    private static final TokenResponse TOKENS = new TokenResponse("access", "refresh", 900, 2_592_000, null);

    private static TelegramProfile profile() {
        return new TelegramProfile(123L, "Shukhrat", "Bozorov", "shukhrat", null);
    }
}
