package uz.efbazaar.bot.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

/**
 * DB-less Telegram boundary for durable marketplace watch deliveries.
 * The caller commits SENDING before invoking this endpoint and never retries an
 * unknown external outcome. deliveryId identifies that claim; it is not a bot
 * deduplication store or a guarantee of exactly-once Telegram delivery.
 */
@RestController
@RequestMapping("/bot/internal/watches")
public class WatchNoticeController {
    private final TelegramApiClient telegram;
    private final String secret;
    public WatchNoticeController(TelegramApiClient telegram,
            @Value("${app.marketplace.secret:}") String secret) {
        this.telegram=telegram;
        this.secret=secret;
    }
    public record Request(@NotNull UUID deliveryId,@NotNull @Positive Long chatId,
                          @NotBlank @Size(max=3500) String text) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Response(Long messageId) {}

    @PostMapping("/dm")
    public Response deliver(@RequestHeader(value="X-Internal-Secret",required=false) String supplied,
                            @Valid @RequestBody Request request) {
        if(secret==null || secret.isBlank())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Watch delivery is not configured");
        if(supplied==null || !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Invalid internal secret");
        // User-authored search names are plain text, never Telegram HTML.
        return telegram.sendMessage(request.chatId().toString(),null,HtmlUtils.htmlEscape(request.text()))
                .map(id->new Response(id.longValue())).orElseGet(()->new Response(null));
    }
}
