package uz.efbazaar.auth.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

/**
 * Redis-backed refresh token blacklist.
 * On logout the refresh token's jti goes into the blacklist for the duration
 * of its remaining lifetime — after that Redis expires the key automatically.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenBlacklistService {

    private static final String PREFIX = "bl:refresh:";

    private final StringRedisTemplate redis;

    public void blacklist(String jti, Instant expiresAt) {
        long ttlSeconds = Math.max(1, Duration.between(Instant.now(), expiresAt).getSeconds());
        redis.opsForValue().set(PREFIX + jti, "1", Duration.ofSeconds(ttlSeconds));
        log.debug("Blacklisted refresh token jti={} ttl={}s", jti, ttlSeconds);
    }

    public boolean isBlacklisted(String jti) {
        Boolean exists = redis.hasKey(PREFIX + jti);
        return Boolean.TRUE.equals(exists);
    }
}
