package uz.efbazaar.bot.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * Internal endpoint — payment-service posts invoice notices into the admin
 * group's payments topic through here.
 *
 * <p>Not reachable from outside: nginx answers 404 for {@code /bot/internal/},
 * and the port is only published on the compose network. Like
 * {@link MediaUploadController} it carries no token of its own — the network
 * boundary is the whole security model for {@code /bot/internal/}, and a lone
 * bearer token on one endpoint would be inconsistency dressed up as safety.
 *
 * <p>The caller sends rendered HTML and learns nothing about the chat or the
 * topic. Every Telegram identifier stays in this service, beside the token.
 *
 * <p>An unconfigured topic is not an error. The endpoint answers 200 with a
 * null message id, and payment-service records "not announced" — a platform
 * running without an admin group must still take deposits.
 */
@Slf4j
@RestController
@RequestMapping("/bot/internal/payments")
@RequiredArgsConstructor
public class PaymentNoticeController {

    private final TelegramApiClient telegram;
    private final TelegramProperties props;

    public record NoticeRequest(@NotBlank String text) {}

    public record DeleteRequest(@NotNull Long messageId) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NoticeResponse(Long messageId) {}

    @PostMapping("/notice")
    public NoticeResponse notice(@Valid @RequestBody NoticeRequest req) {
        Integer topic = topicOrNull();
        if (topic == null) {
            return new NoticeResponse(null);
        }
        return telegram.sendMessage(props.groupChatId(), topic, req.text())
                .map(id -> new NoticeResponse(id.longValue()))
                .orElseGet(() -> new NoticeResponse(null));
    }

    @PostMapping("/notice/delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@Valid @RequestBody DeleteRequest req) {
        if (topicOrNull() == null) {
            return;
        }
        telegram.deleteMessage(props.groupChatId(), req.messageId());
    }

    /**
     * The log line names neither the chat id nor the thread id — both are
     * secrets and a warning is not a reason to print them.
     */
    private Integer topicOrNull() {
        Integer topic = props.topics() == null ? null : props.topics().payments();
        if (topic == null || props.groupChatId() == null || props.groupChatId().isBlank()) {
            log.warn("Payments topic is not configured — invoice notice dropped");
            return null;
        }
        return topic;
    }
}
