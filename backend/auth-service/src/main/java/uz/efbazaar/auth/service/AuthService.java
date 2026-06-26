package uz.efbazaar.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.LoginRequest;
import uz.efbazaar.auth.dto.RefreshRequest;
import uz.efbazaar.auth.dto.RegisterRequest;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.mapper.UserMapper;
import uz.efbazaar.auth.security.JwtProperties;
import uz.efbazaar.auth.security.JwtService;
import uz.efbazaar.auth.security.TokenBlacklistService;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserService userService;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;
    private final TokenBlacklistService blacklist;
    private final AuthEventPublisher events;
    private final UserMapper userMapper;

    public TokenResponse register(RegisterRequest request) {
        User user = userService.register(request);
        return issueTokens(user, false);
    }

    public TokenResponse login(LoginRequest request) {
        User user = userService.authenticate(request.usernameOrEmail(), request.password());
        events.userLoggedIn(user.getId());
        return issueTokens(user, false);
    }

    public TokenResponse refresh(RefreshRequest request) {
        Claims claims;
        try {
            claims = jwtService.parseRefresh(request.refreshToken());
        } catch (JwtException e) {
            throw AuthException.invalidToken();
        }

        String jti = claims.getId();
        if (jti == null || blacklist.isBlacklisted(jti)) {
            throw AuthException.invalidToken();
        }

        UUID userId = parseSubject(claims);
        User user = userService.getById(userId);

        // Rotation: invalidate old refresh
        Instant oldExpiry = claims.getExpiration().toInstant();
        blacklist.blacklist(jti, oldExpiry);

        return issueTokens(user, true);
    }

    public void logout(String refreshToken) {
        Claims claims;
        try {
            claims = jwtService.parseRefresh(refreshToken);
        } catch (JwtException e) {
            // Idempotent: invalid/expired token treated as already-logged-out
            return;
        }
        String jti = claims.getId();
        if (jti != null) {
            blacklist.blacklist(jti, claims.getExpiration().toInstant());
        }
    }

    // ----- internal -----

    private TokenResponse issueTokens(User user, boolean rotated) {
        String accessToken = jwtService.issueAccessToken(user);
        var refresh = jwtService.issueRefreshToken(user.getId());

        if (rotated) {
            log.debug("Rotated tokens issued for userId={}", user.getId());
        }

        return new TokenResponse(
                accessToken,
                refresh.token(),
                jwtProperties.accessTokenTtl().getSeconds(),
                jwtProperties.refreshTokenTtl().getSeconds(),
                userMapper.toResponse(user)
        );
    }

    private UUID parseSubject(Claims claims) {
        try {
            return UUID.fromString(claims.getSubject());
        } catch (IllegalArgumentException e) {
            throw AuthException.invalidToken();
        }
    }
}
