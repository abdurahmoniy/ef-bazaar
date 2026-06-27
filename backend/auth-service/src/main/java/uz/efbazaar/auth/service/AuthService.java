package uz.efbazaar.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.RefreshRequest;
import uz.efbazaar.auth.dto.TokenResponse;
import uz.efbazaar.auth.exception.AuthException;
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
    private final TokenBlacklistService blacklist;
    private final TokenIssuer tokenIssuer;

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

        Instant oldExpiry = claims.getExpiration().toInstant();
        blacklist.blacklist(jti, oldExpiry);

        return tokenIssuer.issue(user);
    }

    public void logout(String refreshToken) {
        Claims claims;
        try {
            claims = jwtService.parseRefresh(refreshToken);
        } catch (JwtException e) {
            return; // idempotent
        }
        String jti = claims.getId();
        if (jti != null) {
            blacklist.blacklist(jti, claims.getExpiration().toInstant());
        }
    }

    private UUID parseSubject(Claims claims) {
        try {
            return UUID.fromString(claims.getSubject());
        } catch (IllegalArgumentException e) {
            throw AuthException.invalidToken();
        }
    }
}
