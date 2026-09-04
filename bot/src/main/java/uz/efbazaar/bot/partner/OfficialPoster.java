package uz.efbazaar.bot.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.UrlButton;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

/**
 * E'lonni efBazaar rasmiy kanaliga chiqaradi.
 *
 * <p>Hamkor kanali tanlangan bo'lsa FORWARD qilinadi: "Forwarded from
 * &lt;hamkor kanali&gt;" sarlavhasi efBazaar e'lonni hamkorning
 * auditoriyasidan tortib olmayotganini, balki uning hamkorligini
 * tasdiqlayotganini ko'rsatadi.
 *
 * <p>Forward inline tugmani yo'qotadi — Telegram uni olib tashlaydi.
 * Shuning uchun e'lon havolasi post matnining o'zida ham turadi va
 * forward qilingan nusxada aynan u ishlaydi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OfficialPoster {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final String BUTTON_TEXT = "E'lonni ochish";

    private final TelegramApiClient telegram;
    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    @KafkaListener(
            topics = "efbazaar.marketplace.official-post-requested",
            groupId = "bot-official-posts",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.partner.OfficialPostRequest",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onOfficialPostRequested(OfficialPostRequest e) {
        if (e == null || e.listingId() == null
                || e.officialChannel() == null || e.officialChannel().isBlank()) {
            log.warn("official-post-requested noto'liq keldi: {}", e);
            return;
        }

        Optional<Integer> messageId;
        try {
            messageId = e.isForward() ? forward(e) : publish(e);
        } catch (Exception ex) {
            log.error("E'lon {} rasmiy kanalga chiqmadi: {}", e.listingId(), ex.getMessage());
            report(e.listingId(), null, ex.getMessage());
            return;
        }

        messageId.ifPresentOrElse(
                id -> report(e.listingId(), String.valueOf(id), null),
                () -> report(e.listingId(), null,
                        "Telegram xabarni qabul qilmadi (bot kanalda admin bo'lmasligi mumkin)"));
    }

    private Optional<Integer> forward(OfficialPostRequest e) {
        return telegram.forwardMessage(e.officialChannel(),
                String.valueOf(e.sourceChannelId()),
                Long.parseLong(e.sourceMessageId().trim()));
    }

    private Optional<Integer> publish(OfficialPostRequest e) {
        UrlButton button = new UrlButton(BUTTON_TEXT, e.buttonUrl());
        return e.mediaFileId() == null || e.mediaFileId().isBlank()
                ? telegram.sendMessageWithUrlButton(e.officialChannel(), e.caption(), button)
                : telegram.sendPhotoWithUrlButton(
                        e.officialChannel(), e.mediaFileId(), e.caption(), button);
    }

    /**
     * Natija HAR DOIM yuboriladi.
     *
     * <p>Rasmiy nusxa bepul, ya'ni yiqilishi hech kimning pulini
     * yo'qotmaydi — lekin jim qolsak e'lon rasmiy kanalda yo'qligini
     * hech kim sezmasdi.
     */
    private void report(UUID listingId, String telegramMessageId, String error) {
        try {
            marketplaceWebClient.post()
                    .uri("/internal/marketplace/v1/partners/official-post-result")
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(new OfficialPostResult(listingId, telegramMessageId, error))
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
        } catch (Exception ex) {
            log.error("E'lon {} rasmiy post natijasi yuborilmadi: {}", listingId, ex.getMessage());
        }
    }

    public record OfficialPostResult(UUID listingId, String telegramMessageId, String error) {}
}
