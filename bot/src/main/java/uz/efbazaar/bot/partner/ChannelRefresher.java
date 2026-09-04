package uz.efbazaar.bot.partner;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.partner.ChannelRefreshResults.ChannelRefreshResult;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.Optional;

/**
 * Hamkor kanalini Telegram'dan qayta o'qiydi: obunachi soni, nom,
 * username va avatar.
 *
 * <p>Bu qiymatlar kanal tekshirilgan paytda bir marta olinardi va keyin
 * hech qachon yangilanmasdi. Obunachi soni esa reklama narxining asosi —
 * sotuvchi eskirgan raqamga qarab pul to'laydi. Avatar bundan ham
 * nozik: Telegram eski {@code file_id} ni bir muddat beradi, keyin u
 * yaroqsiz bo'ladi va rasm butunlay yo'qoladi.
 */
@Slf4j
@Component
public class ChannelRefresher {

    private final TelegramApiClient telegram;
    private final ChannelRefreshResults results;

    public ChannelRefresher(TelegramApiClient telegram, ChannelRefreshResults results) {
        this.telegram = telegram;
        this.results = results;
    }

    public void refresh(ChannelRefreshRequest request) {
        long channelId = request.telegramChannelId();

        Optional<JsonNode> chat = telegram.getChat(channelId);
        if (chat.isEmpty()) {
            results.report(ChannelRefreshResult.failed(
                    request.partnerChannelId(), "getChat javob bermadi"));
            return;
        }

        // Obunachi soni ALOHIDA chaqiruv: getChat uni qaytarmaydi.
        // Biri o'qilmasa yangilanish butunlay o'tkazib yuboriladi —
        // yarim yangilansa kanalda eski son bilan yangi rasm qolardi.
        Optional<Integer> subscribers = telegram.getChatMemberCount(channelId);
        if (subscribers.isEmpty()) {
            results.report(ChannelRefreshResult.failed(
                    request.partnerChannelId(), "getChatMemberCount javob bermadi"));
            return;
        }

        JsonNode node = chat.get();
        results.report(ChannelRefreshResult.read(
                request.partnerChannelId(),
                text(node, "title"),
                text(node, "username"),
                node.path("photo").path("big_file_id").asText(null),
                subscribers.get()));
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value;
    }
}
