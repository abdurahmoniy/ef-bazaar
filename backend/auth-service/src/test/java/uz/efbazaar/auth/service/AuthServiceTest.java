package uz.efbazaar.auth.service;

import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.RefreshRequest;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.security.JwtService;
import uz.efbazaar.auth.security.TokenBlacklistService;

import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    private static final TokenResponse TOKENS = new TokenResponse("access", "refresh", 900, 2_592_000, null);

    @Mock UserService userService;
    @Mock JwtService jwtService;
    @Mock TokenBlacklistService blacklist;
    @Mock TokenIssuer tokenIssuer;
    @Mock AccessGate accessGate;

    @InjectMocks AuthService service;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        Claims claims = mock(Claims.class);
        when(claims.getId()).thenReturn("jti-1");
        when(claims.getSubject()).thenReturn(userId.toString());
        when(claims.getExpiration()).thenReturn(new Date(System.currentTimeMillis() + 60_000));
        when(jwtService.parseRefresh("rt")).thenReturn(claims);
    }

    @Test
    void refresh_endsSession_whenAccessRequirementsUnmet() {
        when(userService.getById(userId)).thenReturn(user(123L, Role.USER));
        when(accessGate.allows(123L)).thenReturn(false);

        assertThatThrownBy(() -> service.refresh(new RefreshRequest("rt")))
                .isInstanceOf(AuthException.class)
                .extracting("code").isEqualTo("ACCESS_REQUIREMENTS_UNMET");
        verify(blacklist).blacklist(eq("jti-1"), any());
        verify(tokenIssuer, never()).issue(any());
    }

    @Test
    void refresh_issuesTokens_whenAccessRequirementsMet() {
        User user = user(123L, Role.USER);
        when(userService.getById(userId)).thenReturn(user);
        when(accessGate.allows(123L)).thenReturn(true);
        when(tokenIssuer.issue(user)).thenReturn(TOKENS);

        assertThat(service.refresh(new RefreshRequest("rt"))).isSameAs(TOKENS);
    }

    @Test
    void refresh_skipsAccessCheck_forAdminsAndGoogleOnlyUsers() {
        User admin = user(123L, Role.ADMIN);
        when(userService.getById(userId)).thenReturn(admin);
        when(tokenIssuer.issue(admin)).thenReturn(TOKENS);

        service.refresh(new RefreshRequest("rt"));

        User googleOnly = user(null, Role.USER);
        when(userService.getById(userId)).thenReturn(googleOnly);
        when(tokenIssuer.issue(googleOnly)).thenReturn(TOKENS);
        when(blacklist.isBlacklisted("jti-1")).thenReturn(false);

        service.refresh(new RefreshRequest("rt"));

        verify(accessGate, never()).allows(anyLong());
    }

    private User user(Long telegramId, Role role) {
        return User.builder().id(userId).telegramId(telegramId).role(role).build();
    }
}
