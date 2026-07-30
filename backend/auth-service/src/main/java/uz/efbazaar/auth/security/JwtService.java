package uz.efbazaar.auth.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import uz.efbazaar.auth.domain.User;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Slf4j
@Service
public class JwtService {

    public static final String CLAIM_TELEGRAM_ID = "tid";
    public static final String CLAIM_ROLES = "roles";
    public static final String CLAIM_NAME = "name";
    public static final String CLAIM_TYPE = "typ";
    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REFRESH = "refresh";

    private static final String ISSUER = "efbazaar-auth";

    private final JwtProperties props;
    private final SecretKey key;

    public JwtService(JwtProperties props) {
        this.props = props;
        byte[] secretBytes = props.secret().getBytes(StandardCharsets.UTF_8);
        if (secretBytes.length < 32) {
            throw new IllegalStateException(
                    "JWT secret kamida 32 byte bo'lishi shart. Hozir: " + secretBytes.length);
        }
        this.key = Keys.hmacShaKeyFor(secretBytes);
    }

    public String issueAccessToken(User user) {
        Instant now = Instant.now();
        Instant exp = now.plus(props.accessTokenTtl());
        var builder = Jwts.builder()
                .issuer(ISSUER)
                .subject(user.getId().toString())
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_TYPE, TYPE_ACCESS)
                .claim(CLAIM_ROLES, user.getRole().authorities())
                // Display name rides in the token so downstream services get it
                // from verify headers with zero DB lookups. Refreshes re-issue
                // the claim, so renames propagate within the 15-min TTL.
                .claim(CLAIM_NAME, user.displayName())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp));
        if (user.getTelegramId() != null) {
            builder.claim(CLAIM_TELEGRAM_ID, user.getTelegramId());
        }
        return builder.signWith(key).compact();
    }

    public IssuedRefreshToken issueRefreshToken(UUID userId) {
        Instant now = Instant.now();
        Instant exp = now.plus(props.refreshTokenTtl());
        String jti = UUID.randomUUID().toString();
        String token = Jwts.builder()
                .issuer(ISSUER)
                .subject(userId.toString())
                .id(jti)
                .claim(CLAIM_TYPE, TYPE_REFRESH)
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(key)
                .compact();
        return new IssuedRefreshToken(token, jti, exp);
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .requireIssuer(ISSUER)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Claims parseRefresh(String token) {
        Claims claims = parse(token);
        if (!TYPE_REFRESH.equals(claims.get(CLAIM_TYPE, String.class))) {
            throw new JwtException("Token type is not 'refresh'");
        }
        return claims;
    }

    public Claims parseAccess(String token) {
        Claims claims = parse(token);
        if (!TYPE_ACCESS.equals(claims.get(CLAIM_TYPE, String.class))) {
            throw new JwtException("Token type is not 'access'");
        }
        return claims;
    }

    public record IssuedRefreshToken(String token, String jti, Instant expiresAt) {}
}
