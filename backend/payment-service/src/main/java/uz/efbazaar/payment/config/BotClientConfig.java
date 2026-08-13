package uz.efbazaar.payment.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Short timeouts on purpose. This client sits in front of the invoice creation
 * path; a hung bot must degrade the notice, never the deposit. Without a read
 * timeout a bot that accepts the connection and then goes quiet would park a
 * payment thread for as long as the socket stays open, which is worse than an
 * outright error.
 */
@Configuration
public class BotClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofMillis(500);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    @Bean
    @Qualifier("botClient")
    public RestClient botRestClient(
            @Value("${payment.admin-telegram.bot-base-url:http://bot:8084}") String baseUrl,
            RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        return builder.baseUrl(baseUrl).requestFactory(factory).build();
    }
}
