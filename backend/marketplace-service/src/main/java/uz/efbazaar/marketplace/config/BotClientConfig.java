package uz.efbazaar.marketplace.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
public class BotClientConfig {

    @Bean
    public RestClient botClient(@Value("${app.bot.internal-base-url:http://bot:8084}") String baseUrl,
                                RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(60).toMillis());

        return builder
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    @Bean
    public RestClientCustomizer restClientCustomizer() {
        return builder -> builder.requestFactory(new SimpleClientHttpRequestFactory());
    }
}
