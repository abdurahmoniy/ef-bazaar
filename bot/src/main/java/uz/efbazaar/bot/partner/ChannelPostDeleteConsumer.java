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
 * <p>Ikkinchi holat: e'lon platformadan butunlay olib tashlandi. Unda
 * kanaldagi nusxa ham ketishi kerak — aks holda olib tashlangan narsa
 * aynan reklama qilinib turaveradi, va tugmasi mavjud bo'lmagan e'longa
 * olib boradi.
 *
 * <p>O'chira olmaslik kechiriladi: botda "xabar o'chirish" huquqi
 * bo'lmasligi yoki xabar allaqachon qo'lda o'chirilgan bo'lishi
 * mumkin. Qayta yuborishda YANGI POST ALLAQACHON CHIQQAN va sotuvchi
 * to'lagan narsasini olgan — buning uchun hech narsani orqaga
 * qaytarmaymiz.
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
        // Manzil raqamli identifikator ham, @username ham bo'lishi mumkin:
        // rasmiy kanal sozlamada matn bo'lib turadi.
        String chat = e == null ? null : e.chatOrChannel();
        if (chat == null || e.telegramMessageId() == null || e.telegramMessageId().isBlank()) {
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
        boolean deleted = telegram.deleteMessage(chat, messageId);
        if (!deleted) {
            log.info("Post {} kanaldan o'chirilmadi (huquq yo'q yoki xabar allaqachon yo'q)",
                    e.postId());
        }
    }
}
