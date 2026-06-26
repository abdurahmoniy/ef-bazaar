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
                .username("alice")
                .email("alice@example.com")
                .passwordHash("hash")
                .telegramId(123456789L)
                .role(Role.USER)
                .build();

        String token = jwtService.issueAccessToken(user);
        Claims claims = jwtService.parseAccess(token);

        assertThat(claims.getSubject()).isEqualTo(userId.toString());
        assertThat(claims.get(JwtService.CLAIM_TYPE)).isEqualTo(JwtService.TYPE_ACCESS);
        assertThat(claims.get(JwtService.CLAIM_TELEGRAM_ID, Long.class)).isEqualTo(123456789L);
        assertThat(claims.get(JwtService.CLAIM_ROLES, java.util.List.class))
                .containsExactly("ROLE_USER");
    }

    @Test
    void accessToken_withoutTelegramId_omitsClaim() {
        User user = User.builder()
                .id(UUID.randomUUID())
                .username("bob")
                .email("bob@example.com")
                .passwordHash("hash")
                .role(Role.USER)
                .build();

        Claims claims = jwtService.parseAccess(jwtService.issueAccessToken(user));
        assertThat(claims.get(JwtService.CLAIM_TELEGRAM_ID)).isNull();
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
                .username("u").email("u@x.com").passwordHash("h").role(Role.USER)
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
