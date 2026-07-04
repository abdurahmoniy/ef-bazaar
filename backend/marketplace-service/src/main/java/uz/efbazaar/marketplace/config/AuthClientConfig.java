package uz.efbazaar.marketplace.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Server-to-server client for auth-service's {@code /internal/**} endpoints
 * (currently: display-name resolution at chat creation). Shares the same
 * short-timeout profile as other internal calls — the caller falls back to
 * a role label if auth is slow or unreachable.
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
}
