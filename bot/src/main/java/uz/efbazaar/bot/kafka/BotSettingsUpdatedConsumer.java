package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.settings.BotSettingsClient;

/**
 * Admin /start xabarini yangilaganda keshni darhol yangilaydi.
 *
 * <p>Busiz bot o'zgarishni faqat 6 soatlik zaxira sync'da bilardi — admin
 * uchun bu "saqladim, lekin botda eski matn" degan tushunarsiz holat.
 *
 * <p>Event ichida matn YO'Q, faqat signal. Bot uni eshitgach ichki API'dan
 * qayta tortadi, ya'ni matnning bitta manbasi qoladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BotSettingsUpdatedConsumer {

    private final BotSettingsClient settings;

    /**
     * {@code groupId} boshqa consumer'lardan alohida — offsetlar mustaqil
     * siljisin va bu listener'ning kechikishi boshqa xabarlarni ushlab
     * qolmasin.
     */
    @KafkaListener(
            topics = "efbazaar.marketplace.bot-settings-updated",
            groupId = "bot-settings-refresher",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.BotSettingsUpdatedDto"}
    )
    public void onBotSettingsUpdated(BotSettingsUpdatedDto event) {
        boolean refreshed = settings.refreshNow();
        if (refreshed) {
            log.info("Bot sozlamalari yangilandi (admin={}), kesh yangilandi", event.updatedBy());
        } else {
            // Yiqilish emas: eski matn ishlashda davom etadi va keyingi
            // /start qayta urinadi. Lekin admin o'zgarishni darrov
            // ko'rmaydi, shuning uchun WARN.
            log.warn("Bot sozlamalari yangilandi (admin={}), lekin keshni tortib bo'lmadi",
                    event.updatedBy());
        }
    }
}
