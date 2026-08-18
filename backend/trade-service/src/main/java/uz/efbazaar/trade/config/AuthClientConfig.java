package uz.efbazaar.trade.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Server-to-server client for auth-service's {@code /internal/**} endpoints
 * (display names and avatars for the trade-admin catalogue). Same short-timeout
 * profile as marketplace-service's copy: callers are fail-soft, so a slow auth
 * must degrade the response rather than fail it.
 */
@Configuration
public class AuthClientConfig {

    @Bean
    @Qualifier("authClient")
    public RestClient authClient(@Value("${app.auth.internal-base-url:http://auth-service:8081}") String baseUrl,
                                 RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofMillis(500).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(2).toMillis());
        return builder
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    /**
     * Reads listing terms before a trade opens. Same timeouts as the auth
     * client: this sits on the accept path, and a marketplace that has stopped
     * answering must fail the accept quickly rather than hold the caller.
     */
    @Bean
    @Qualifier("marketplaceClient")
    public RestClient marketplaceClient(
            @Value("${app.marketplace.internal-base-url:http://marketplace-service:8082}") String baseUrl,
            RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofMillis(500).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(2).toMillis());
        return builder
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }
}
