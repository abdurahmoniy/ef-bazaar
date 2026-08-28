package uz.efbazaar.bot.broadcast;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.List;

/**
 * Manzillar ro'yxatini auth-service'dan sahifalab oladi.
 *
 * <p>Ro'yxat butunlay xotiraga yuklanmaydi: o'n minglab yozuv bo'lishi
 * mumkin va bot 160 MB heap bilan ishlaydi. Jo'natish sahifama-sahifa
 * boradi, ya'ni bir vaqtda faqat bitta sahifa xotirada turadi.
 */
@Slf4j
@Component
public class BroadcastRecipients {

    private static final int PAGE_SIZE = 500;
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    private final WebClient authWebClient;
    private final BotSettingsProperties props;

    public BroadcastRecipients(WebClient authWebClient, BotSettingsProperties props) {
        this.authWebClient = authWebClient;
        this.props = props;
    }

    /**
     * @return sahifadagi chat id lar, yoki null — so'rov muvaffaqiyatsiz.
     *         Bo'sh ro'yxat va nosozlik farqlanishi SHART: bo'sh ro'yxat
     *         "yakunlandi", nosozlik esa "to'xtatish" degani. Ikkalasini
     *         bir xil qabul qilsak, auth yiqilganda jo'natish muvaffaqiyat
     *         sifatida yakunlanardi.
     */
    public TelegramIdPage fetch(BroadcastJob.Audience audience, int page) {
        try {
            return authWebClient.get()
                    .uri(uri -> uri.path("/internal/auth/v1/users/telegram-ids")
                            .queryParam("audience", audience.name())
                            .queryParam("page", page)
                            .queryParam("size", PAGE_SIZE)
                            .build())
                    .header("X-Internal-Secret", props.secret())
                    .retrieve()
                    .bodyToMono(TelegramIdPage.class)
                    .timeout(TIMEOUT)
                    .block();
        } catch (Exception e) {
            log.error("Manzillar ro'yxatini olib bo'lmadi (audience={} page={}): {}",
                    audience, page, e.getMessage());
            return null;
        }
    }

    /** Spring Data `Page` javobining bizga kerakli qismi. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TelegramIdPage(List<Long> content, boolean last, long totalElements) {}
}
