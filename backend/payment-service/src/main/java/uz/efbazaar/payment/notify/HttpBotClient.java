package uz.efbazaar.payment.notify;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.OptionalLong;

/**
 * Posts rendered notices at {@code bot}, which owns the token, the group chat
 * id and the thread id. This service knows none of those.
 *
 * <p>This class deliberately catches <b>nothing</b>. Swallowing lives one layer
 * up, in {@link AdminTelegramNotifier}, so there is exactly one place to look
 * for it.
 */
@Slf4j
@Component
public class HttpBotClient implements BotClient {

    private static final String NOTICE = "/bot/internal/payments/notice";
    private static final String DELETE = "/bot/internal/payments/notice/delete";

    private final RestClient http;

    public HttpBotClient(@Qualifier("botClient") RestClient http) {
        this.http = http;
    }

    public record NoticeResponse(Long messageId) {}

    @Override
    public OptionalLong postPaymentNotice(String html) {
        NoticeResponse res = http.post()
                .uri(NOTICE)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("text", html))
                .retrieve()
                .body(NoticeResponse.class);
        return res == null || res.messageId() == null
                ? OptionalLong.empty()
                : OptionalLong.of(res.messageId());
    }

    @Override
    public void deletePaymentNotice(long messageId) {
        http.post()
                .uri(DELETE)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("messageId", messageId))
                .retrieve()
                .toBodilessEntity();
    }
}
