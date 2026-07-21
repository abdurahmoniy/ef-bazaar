package uz.efbazaar.marketplace.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Shared secret expected on inbound {@code /internal/**} calls. Blank secret
 * → filter rejects all such traffic (fail-closed). Nginx blocks the prefix
 * externally; the header check is defence-in-depth for other services on the
 * docker network.
 */
@ConfigurationProperties(prefix = "app.internal")
public record InternalApiProperties(String secret) {}
