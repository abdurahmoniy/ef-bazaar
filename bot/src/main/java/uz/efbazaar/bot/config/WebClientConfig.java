package uz.efbazaar.bot.config;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import io.netty.handler.timeout.WriteTimeoutHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

@Configuration
@RequiredArgsConstructor
public class WebClientConfig {

    private final TelegramProperties props;

    @Bean
    public WebClient telegramWebClient() {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 10_000)
                .responseTimeout(Duration.ofSeconds(60))
                .doOnConnected(conn -> conn
                        .addHandlerLast(new ReadTimeoutHandler(60))
                        .addHandlerLast(new WriteTimeoutHandler(60)));

        // Bot API uchun: https://api.telegram.org/bot<token>
        String baseUrl = props.apiBaseUrl() + "/bot" + props.botToken();
        return WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(c -> c.defaultCodecs().maxInMemorySize(50 * 1024 * 1024)) // 50MB
                .build();
    }

    /**
     * marketplace-service'ning ichki API'si uchun. Telegram klientidan alohida
     * bean, chunki base URL va — muhimi — timeoutlar butunlay boshqacha:
     * bu yerdagi so'rov foydalanuvchi /start javobini kutib turganda ketadi,
     * shuning uchun sekin javobdan ko'ra tez muvaffaqiyatsizlik afzal.
     */
    @Bean
    public WebClient marketplaceWebClient(
            @Value("${app.marketplace.internal-base-url:http://marketplace-service:8082}") String baseUrl) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 2_000)
                .responseTimeout(Duration.ofSeconds(3))
                .doOnConnected(conn -> conn
                        .addHandlerLast(new ReadTimeoutHandler(3))
                        .addHandlerLast(new WriteTimeoutHandler(3)));

        return WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    /**
     * auth-service'ning ichki API'si — ommaviy xabar uchun manzillar ro'yxati.
     *
     * <p>Timeout marketplace klientinikidan uzunroq: bu so'rov foydalanuvchi
     * kutib turgan yo'lda emas, fondagi jo'natishda ketadi va u yerda
     * javobni kutish tez muvaffaqiyatsizlikdan afzal — ro'yxatsiz jo'natish
     * umuman boshlanmaydi.
     */
    @Bean
    public WebClient authWebClient(
            @Value("${app.auth.internal-base-url:http://auth-service:8081}") String baseUrl) {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5_000)
                .responseTimeout(Duration.ofSeconds(20))
                .doOnConnected(conn -> conn
                        .addHandlerLast(new ReadTimeoutHandler(20))
                        .addHandlerLast(new WriteTimeoutHandler(20)));

        return WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }
}
