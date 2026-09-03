package uz.efbazaar.bot.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.partner.ChannelPostResults.ChannelPostResult;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.UrlButton;

import java.util.Optional;

/**
 * To'langan e'lonni hamkor kanaliga joylaydi.
 *
 * <p>Tugma ATAYLAB oddiy {@code url} tugmasi: {@code web_app} tugmalari
 * faqat shaxsiy chatda ishlaydi va kanalga shunday tugma bilan yuborilgan
 * xabarni Telegram butunlay rad etadi — rasm ham, matn ham chiqmaydi.
 * Shuning uchun bu yerda {@link TelegramApiClient#sendMessageWithUrlButton}
 * va uning rasmli egizagi {@link TelegramApiClient#sendPhotoWithUrlButton}
 * ishlatiladi, {@code ...WithKeyboard} lar emas.
 *
 * <p>Har bir urinish natijasi marketplace'ga qaytariladi — muvaffaqiyatsizi
 * ham. Pul e'lon joylanmaguncha ushlab turilgani uchun jim qolish
 * sotuvchining pulini abadiy muzlatib qo'yardi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChannelPoster {

    private static final String BUTTON_TEXT = "🛒 E'lonni ochish";

    /**
     * Telegram xatolik sababini bermaydi — {@link TelegramApiClient} uni
     * log'ga yozib bo'sh javob qaytaradi. Eng ko'p uchraydigan sabab
     * botning kanalda admin emasligi, shuni ishora qilib qo'yamiz.
     */
    private static final String REJECTED = "Telegram xabarni qabul qilmadi "
            + "(bot kanalda admin bo'lmasligi mumkin)";

    private final TelegramApiClient telegram;
    private final ChannelPostResults results;

    public void post(ChannelPostRequest request) {
        if (request.buttonUrl() == null || request.buttonUrl().isBlank()) {
            // Havolasiz e'lon joylashning ma'nosi yo'q: xaridor e'longa
            // qaytib kelolmaydi va hamkorga to'lov ham asossiz bo'lardi.
            results.report(ChannelPostResult.failed(request.postId(), "E'lon havolasi bo'sh"));
            return;
        }

        String chatId = String.valueOf(request.telegramChannelId());
        UrlButton button = new UrlButton(BUTTON_TEXT, request.buttonUrl());

        Optional<Integer> messageId;
        try {
            messageId = hasMedia(request)
                    ? telegram.sendPhotoWithUrlButton(
                            chatId, request.mediaMessageId(), request.caption(), button)
                    : telegram.sendMessageWithUrlButton(chatId, request.caption(), button);
        } catch (Exception e) {
            log.error("Kanal e'loni {} yuborilmadi: {}", request.postId(), e.getMessage());
            results.report(ChannelPostResult.failed(request.postId(), e.getMessage()));
            return;
        }

        results.report(messageId
                .map(id -> ChannelPostResult.posted(request.postId(), id))
                .orElseGet(() -> ChannelPostResult.failed(request.postId(), REJECTED)));
    }

    private boolean hasMedia(ChannelPostRequest request) {
        return request.mediaMessageId() != null && !request.mediaMessageId().isBlank();
    }
}
