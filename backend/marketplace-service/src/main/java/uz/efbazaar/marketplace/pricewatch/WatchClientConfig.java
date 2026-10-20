package uz.efbazaar.marketplace.pricewatch;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class WatchClientConfig {
    @Bean RestClient watchRecommendationClient(@Value("${app.watch.recommendation-base-url:http://recommendation-service:8083}")String url){return client(url);}
    @Bean RestClient watchBotClient(@Value("${app.bot.internal-base-url:http://bot:8084}")String url){return client(url);}
    private RestClient client(String url){var f=new SimpleClientHttpRequestFactory();f.setConnectTimeout(3000);f.setReadTimeout(8000);return RestClient.builder().baseUrl(url).requestFactory(f).build();}
}
