package uz.efbazaar.auth.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
        String secret,
        int accessTokenTtlMinutes,
        int refreshTokenTtlDays
) {
    public Duration accessTokenTtl() {
        return Duration.ofMinutes(accessTokenTtlMinutes);
    }

    public Duration refreshTokenTtl() {
        return Duration.ofDays(refreshTokenTtlDays);
    }
}
