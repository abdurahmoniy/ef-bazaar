package uz.efbazaar.bot.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * E'lon qayta yuborilgach oldingi postni kanaldan olib tashlaydi.
 *
 * <p>Faol kanalda e'lonlar tez aylanadi va sotuvchi e'lonini qaytadan
 * yuqoriga chiqaradi. Eskisi qolsa obunachi bir xil e'lonni ikki marta
 * ko'rar, pastdagi eskirgan narxli postga tushib qolardi.
 *
 * <p>O'chira olmaslik kechiriladi: botda "xabar o'chirish" huquqi
 * bo'lmasligi yoki xabar allaqachon qo'lda o'chirilgan bo'lishi
 * mumkin. YANGI POST ALLAQACHON CHIQQAN va sotuvchi to'lagan narsasini
 * olgan — buning uchun hech narsani orqaga qaytarmaymiz.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChannelPostDeleteConsumer {

    private final TelegramApiClient telegram;

    @KafkaListener(
            topics = "efbazaar.marketplace.channel-post-delete-requested",
            groupId = "bot-channel-post-delete",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.partner.ChannelPostDeleteRequest",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onDeleteRequested(ChannelPostDeleteRequest e) {
        if (e == null || e.telegramChannelId() == null
                || e.telegramMessageId() == null || e.telegramMessageId().isBlank()) {
            log.warn("channel-post-delete-requested noto'liq keldi: {}", e);
            return;
        }
        long messageId;
        try {
            messageId = Long.parseLong(e.telegramMessageId().trim());
        } catch (NumberFormatException ex) {
            log.warn("Post {} xabar identifikatori raqam emas: {}", e.postId(), e.telegramMessageId());
            return;
        }
        boolean deleted = telegram.deleteMessage(String.valueOf(e.telegramChannelId()), messageId);
        if (!deleted) {
            log.info("Post {} kanaldan o'chirilmadi (huquq yo'q yoki xabar allaqachon yo'q)",
                    e.postId());
        }
    }
}
