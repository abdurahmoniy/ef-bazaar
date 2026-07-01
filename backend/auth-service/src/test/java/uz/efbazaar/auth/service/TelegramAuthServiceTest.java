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
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;
import uz.efbazaar.auth.security.TelegramLoginValidator;
import uz.efbazaar.auth.security.TelegramWebAppValidator;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TelegramAuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock TelegramLoginValidator loginWidgetValidator;
    @Mock TelegramWebAppValidator webAppValidator;
    @Mock AuthEventPublisher events;
    @Mock TokenIssuer tokenIssuer;

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
}
