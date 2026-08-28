package uz.efbazaar.marketplace.botsettings;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.Audience;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.InlineButton;

import java.util.List;
import java.util.UUID;

/**
 * Jo'natish topshirig'ini botga uzatadi.
 *
 * <p>Bot 202 qaytaradi va ishni fonda bajaradi — jo'natish daqiqalar
 * davom etadi (Telegram sekundiga ~30 xabarga ruxsat beradi), shuning
 * uchun uni HTTP so'rov ichida kutib bo'lmaydi.
 *
 * <p>Topshirish muvaffaqiyatsiz bo'lsa qator QUEUED holida qoladi va
 * adminka buni "boshlanmadi" deb ko'rsatadi. Bu ataylab: jimgina
 * yo'qolgan jo'natmadan ko'ra ko'rinadigan turgan jo'natma yaxshiroq.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BotBroadcastDispatcher {

    @Qualifier("botClient")
    private final RestClient botClient;

    public void dispatch(UUID id, String text, String bannerFileId,
                         List<List<InlineButton>> buttons, Audience audience,
                         List<Long> recipientTelegramIds) {
        try {
            botClient.post()
                    .uri("/bot/internal/broadcast")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new BroadcastJob(id, text, bannerFileId, buttons, audience,
                            recipientTelegramIds))
                    .retrieve()
                    .toBodilessEntity();
            log.info("Broadcast {} handed to bot", id);
        } catch (RestClientException e) {
            log.error("Broadcast {} could not be handed to bot: {}", id, e.getMessage());
        }
    }

    public record BroadcastJob(UUID broadcastId, String messageText, String bannerFileId,
                               List<List<InlineButton>> buttons, Audience audience,
                               List<Long> recipientTelegramIds) {}
}
