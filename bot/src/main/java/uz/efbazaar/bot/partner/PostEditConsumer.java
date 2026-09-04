package uz.efbazaar.bot.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * Sotilgan e'lonning kanaldagi postini belgilaydi.
 *
 * <p>Post o'chirilmaydi — hamkor to'lov olgan reklamasini yo'qotib
 * qo'yardi va kanal tarixi teshilardi. O'rniga matn ustidan chiziladi
 * va TUGMA OLIB TASHLANADI: ustidan chizilgan matnni o'qimagan odam
 * ham tugmani bosib, mavjud bo'lmagan taklifga borardi.
 *
 * <p>Tahrirlab bo'lmasligi kechiriladi: xabar qo'lda o'chirilgan yoki
 * bot huquqini yo'qotgan bo'lishi mumkin. Savdo allaqachon yakunlangan
 * va uni orqaga qaytaradigan narsa yo'q.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PostEditConsumer {

    private final TelegramApiClient telegram;

    @KafkaListener(
            topics = "efbazaar.marketplace.channel-post-edit-requested",
            groupId = "bot-channel-post-edit",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.partner.PostEditRequest",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onEditRequested(PostEditRequest e) {
        if (e == null || e.chatId() == null || e.chatId().isBlank()
                || e.telegramMessageId() == null || e.telegramMessageId().isBlank()
                || e.html() == null || e.html().isBlank()) {
            log.warn("channel-post-edit-requested noto'liq keldi: {}", e);
            return;
        }
        long messageId;
        try {
            messageId = Long.parseLong(e.telegramMessageId().trim());
        } catch (NumberFormatException ex) {
            log.warn("Xabar identifikatori raqam emas: {}", e.telegramMessageId());
            return;
        }
        if (!telegram.editPostText(e.chatId(), messageId, e.html())) {
            log.info("Post {}:{} tahrirlanmadi (xabar yo'q yoki huquq yetmadi)",
                    e.chatId(), e.telegramMessageId());
        }
    }
}
