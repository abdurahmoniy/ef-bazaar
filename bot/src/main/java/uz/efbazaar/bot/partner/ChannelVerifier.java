package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Duration;

/**
 * Bot kanalga admin qilib qo'shilganda kanalni tekshiradi.
 *
 * <p>Barcha raqamlar TELEGRAM API'DAN olinadi, foydalanuvchidan emas.
 * Obunachi sonini ham, kanal egaligini ham foydalanuvchi kiritganida
 * ikkalasini soxtalashtirib bo'lardi — hamkorlik esa aynan shu ikki
 * qiymatga tayanadi.
 *
 * <p>Tekshiruv NATIJASI (o'tdi yoki o'tmadi) marketplace'ga baribir
 * yuboriladi: qaror u yerda qabul qilinadi va foydalanuvchiga nimani
 * tuzatish kerakligi aytiladi.
 */
@Slf4j
@Component
public class ChannelVerifier {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final TelegramApiClient telegram;
    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public ChannelVerifier(TelegramApiClient telegram, WebClient marketplaceWebClient,
                           BotSettingsProperties props) {
        this.telegram = telegram;
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    /**
     * {@code my_chat_member} yangilanishini qayta ishlaydi.
     *
     * <p>Faqat KANALDA va faqat bot ADMIN bo'lganda ishlaydi. Guruhlar,
     * oddiy a'zolik va botning chiqarilishi e'tiborsiz qoldiriladi —
     * ularning hamkorlikka aloqasi yo'q.
     */
    public void handle(JsonNode myChatMember) {
        JsonNode chat = myChatMember.path("chat");
        if (!"channel".equals(chat.path("type").asText())) return;

        String newStatus = myChatMember.path("new_chat_member").path("status").asText("");
        if (!"administrator".equals(newStatus)) {
            log.debug("Kanal {} da botning maqomi: {} — e'tiborsiz",
                    chat.path("id").asLong(), newStatus);
            return;
        }

        long channelId = chat.path("id").asLong();
        long addedBy = myChatMember.path("from").path("id").asLong();
        if (channelId == 0 || addedBy == 0) return;

        int subscribers = telegram.getChatMemberCount(channelId).orElse(-1);
        if (subscribers < 0) {
            // Bot admin bo'lgani bilan son o'qilmadi — bu tarmoq nosozligi
            // yoki huquq yetishmasligi. Arizani buzmaymiz: foydalanuvchi
            // botni qayta qo'shsa hodisa yana keladi.
            log.warn("Kanal {} obunachi sonini o'qib bo'lmadi", channelId);
            return;
        }

        // Faqat `creator` — kanal egasi. Administrator kanal egasi emas va
        // hamkorlik egaga beriladi.
        boolean isOwner = telegram.getChatMemberStatus(channelId, addedBy)
                .map("creator"::equals)
                .orElse(false);

        report(new ChannelVerifiedRequest(
                addedBy,
                channelId,
                chat.path("title").asText(null),
                chat.path("username").asText(null),
                subscribers,
                isOwner));
    }

    private void report(ChannelVerifiedRequest request) {
        try {
            marketplaceWebClient.post()
                    .uri("/internal/marketplace/v1/partners/channel-verified")
                    .header("X-Internal-Secret", props.secret())
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .timeout(TIMEOUT)
                    .block();
            log.info("Kanal {} tekshiruvi yuborildi: subscribers={} owner={}",
                    request.channelId(), request.subscriberCount(), request.addedByIsOwner());
        } catch (Exception e) {
            log.error("Kanal {} tekshiruvini yuborib bo'lmadi: {}",
                    request.channelId(), e.getMessage());
        }
    }

    public record ChannelVerifiedRequest(
            Long addedByTelegramId,
            Long channelId,
            String channelTitle,
            String channelUsername,
            Integer subscriberCount,
            boolean addedByIsOwner) {}
}
