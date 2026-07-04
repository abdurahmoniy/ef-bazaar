package uz.efbazaar.auth.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Shared secret used to authenticate server-to-server calls to
 * {@code /internal/**}. The path is also blocked at nginx from the public
 * network — the header check exists as defence-in-depth for anyone who reaches
 * the container directly (e.g., other services on the docker network).
 */
@ConfigurationProperties(prefix = "app.internal")
public record InternalApiProperties(String secret) {}
