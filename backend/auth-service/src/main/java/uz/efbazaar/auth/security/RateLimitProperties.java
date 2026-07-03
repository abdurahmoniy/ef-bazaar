package uz.efbazaar.auth.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * Per-endpoint, per-IP request budgets. Values are requests allowed in a fixed
 * 60-second window; a request that would exceed the budget is rejected with 429.
 *
 * <p>Configured under {@code app.rate-limit.*} in {@code application.yml}. The
 * {@code endpoints} map is keyed by request path — a request whose path matches
 * a key exactly is subject to that budget. Absent paths are not rate-limited.
 */
@ConfigurationProperties(prefix = "app.rate-limit")
public record RateLimitProperties(
        boolean enabled,
        Map<String, Integer> endpoints
) {}
