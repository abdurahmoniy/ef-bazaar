package uz.efbazaar.auth.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        JwtProperties props = new JwtProperties(
                "test-secret-must-be-at-least-32-bytes-long-12345",
                15,
                30
        );
        jwtService = new JwtService(props);
    }

    @Test
    void issueAndParseAccessToken_roundtrip() {
        UUID userId = UUID.randomUUID();
        User user = User.builder()
                .id(userId)
                .telegramId(123456789L)
                .telegramFirstName("Alice")
                .role(Role.USER)
                .build();

        String token = jwtService.issueAccessToken(user);
        Claims claims = jwtService.parseAccess(token);

        assertThat(claims.getSubject()).isEqualTo(userId.toString());
        assertThat(claims.get(JwtService.CLAIM_TYPE)).isEqualTo(JwtService.TYPE_ACCESS);
        assertThat(claims.get(JwtService.CLAIM_TELEGRAM_ID, Long.class)).isEqualTo(123456789L);
        @SuppressWarnings("unchecked")
        java.util.List<String> roles = (java.util.List<String>) claims.get(JwtService.CLAIM_ROLES, java.util.List.class);
        assertThat(roles).containsExactly("ROLE_USER");
    }

    @Test
    void issueRefreshToken_hasUniqueJtiAndTypeRefresh() {
        UUID userId = UUID.randomUUID();
        var t1 = jwtService.issueRefreshToken(userId);
        var t2 = jwtService.issueRefreshToken(userId);

        assertThat(t1.jti()).isNotEqualTo(t2.jti());
        Claims claims = jwtService.parseRefresh(t1.token());
        assertThat(claims.get(JwtService.CLAIM_TYPE)).isEqualTo(JwtService.TYPE_REFRESH);
        assertThat(claims.getId()).isEqualTo(t1.jti());
    }

    @Test
    void parseAccess_rejectsRefreshToken() {
        var refresh = jwtService.issueRefreshToken(UUID.randomUUID());
        assertThatThrownBy(() -> jwtService.parseAccess(refresh.token()))
                .isInstanceOf(JwtException.class)
                .hasMessageContaining("access");
    }

    @Test
    void parseRefresh_rejectsAccessToken() {
        User user = User.builder()
                .id(UUID.randomUUID())
                .telegramId(42L)
                .role(Role.USER)
                .build();
        String access = jwtService.issueAccessToken(user);

        assertThatThrownBy(() -> jwtService.parseRefresh(access))
                .isInstanceOf(JwtException.class)
                .hasMessageContaining("refresh");
    }

    @Test
    void shortSecret_failsConstructor() {
        JwtProperties bad = new JwtProperties("too-short", 15, 30);
        assertThatThrownBy(() -> new JwtService(bad))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 byte");
    }
}
