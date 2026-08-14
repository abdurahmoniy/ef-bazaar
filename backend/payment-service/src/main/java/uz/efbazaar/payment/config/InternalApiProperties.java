package uz.efbazaar.payment.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Shared secret authenticating server-to-server calls to {@code /internal/**}.
 * Mirrors auth-service, which uses the same header for the same purpose.
 *
 * <p>The path is blocked at nginx from the public network; the header check is
 * defence-in-depth for anything that reaches the container directly over the
 * docker network. Blank means every internal call is refused — these endpoints
 * move money, so an unconfigured environment must fail closed.
 */
@ConfigurationProperties(prefix = "app.internal")
public record InternalApiProperties(String secret) {}
