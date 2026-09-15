package uz.efbazaar.access.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * Qisqa timeoutlar ataylab: bu mijoz login yo'lida turadi. Osilib qolgan bot
 * login'ni kechiktirmasligi kerak — auth-service o'z timeoutidan keyin
 * tekshiruvni o'tkazib yuboradi, bu yerdagi so'rov esa undan oldin tugasin.
 */
@Configuration
public class BotClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofMillis(500);
    private static final Duration READ_TIMEOUT = Duration.ofMillis(1500);

    @Bean
    public RestClient botRestClient(AccessProperties properties, RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        return builder.baseUrl(properties.bot().internalBaseUrl()).requestFactory(factory).build();
    }
}
