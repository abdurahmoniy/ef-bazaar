package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.kafka.PartnerDecisionDtos.PartnerApproved;
import uz.efbazaar.bot.kafka.PartnerDecisionDtos.PartnerCancelled;
import uz.efbazaar.bot.kafka.PartnerDecisionDtos.PartnerRejected;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.WebAppButton;

/**
 * Hamkorlik bo'yicha qarorni ARIZACHINING o'ziga yetkazadi.
 *
 * <p>Ilgari qaror qabul qilingach hech kimga xabar ketmasdi: odam
 * pul to'lagan, admin qachon ko'rishi noma'lum, javob esa jimlik
 * edi — arizachi o'zi sahifaga qaytib kirmaguncha bilmasdi.
 *
 * <p>Manzil hodisa ichida keladi. Telegram orqali kirmagan odamda u
 * bo'sh bo'ladi va DM ketmaydi — platforma bildirishnomasi esa
 * baribir yozilgan, u boshqa yo'ldan boradi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerDecisionConsumer {

    private final TelegramApiClient telegram;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @KafkaListener(
            topics = "efbazaar.marketplace.partner-approved",
            groupId = "bot-partner-decisions",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.kafka.PartnerDecisionDtos$PartnerApproved",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onApproved(PartnerApproved e) {
        if (e == null || e.recipientTelegramId() == null) return;
        // Panelga havola SHART: hamkor u yerda e'lon narxini qo'yadi.
        // Narx nolda qolsa kanaliga bepul e'lon joylanaveradi va odam
        // buni umuman bilmaydi.
        send(e.recipientTelegramId(),
                "🤝 <b>Hamkorligingiz tasdiqlandi</b>\n\n"
                        + "Kanalingiz reklama bozorida ko'rina boshladi.\n\n"
                        + "Panelda e'lon joylash narxini qo'ying — hozir u <b>0 so'm</b>.",
                new WebAppButton("Hamkor paneli", webBaseUrl + "/partner"));
    }

    @KafkaListener(
            topics = "efbazaar.marketplace.partner-rejected",
            groupId = "bot-partner-decisions",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.kafka.PartnerDecisionDtos$PartnerRejected",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onRejected(PartnerRejected e) {
        if (e == null || e.recipientTelegramId() == null) return;
        // Sabab bilan: uni bilmagan odam qayta ariza berib yana
        // o'shanga urilardi.
        send(e.recipientTelegramId(),
                "❌ <b>Hamkorlik arizasi rad etildi</b>\n\n"
                        + reason(e.note()),
                new WebAppButton("Ariza sahifasi", webBaseUrl + "/partnership"));
    }

    @KafkaListener(
            topics = "efbazaar.marketplace.partner-cancelled",
            groupId = "bot-partner-decisions",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.kafka.PartnerDecisionDtos$PartnerCancelled",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onCancelled(PartnerCancelled e) {
        if (e == null || e.recipientTelegramId() == null) return;
        // O'zi to'xtatganga yozilmaydi: u hozirgina tasdiqlash oynasini
        // bosgan va bu xabar shunchaki shovqin bo'lardi.
        if (e.bySelf()) return;
        send(e.recipientTelegramId(),
                "⚠️ <b>Hamkorligingiz to'xtatildi</b>\n\n"
                        + reason(e.reason())
                        + "\n\nKanalingiz reklama bozoridan olib qo'yildi.",
                new WebAppButton("Ariza sahifasi", webBaseUrl + "/partnership"));
    }

    private void send(long chatId, String text, WebAppButton button) {
        try {
            telegram.sendMessage(String.valueOf(chatId), null, text, button);
        } catch (RuntimeException ex) {
            // Botni bloklagan odamga yozib bo'lmaydi va bu qarorni
            // bekor qilmaydi. Platforma bildirishnomasi joyida qoladi.
            log.warn("Hamkorlik qarori yetkazilmadi telegramId={}: {}", chatId, ex.getMessage());
        }
    }

    private String reason(String note) {
        return note == null || note.isBlank() ? "Sabab ko'rsatilmagan." : escape(note);
    }

    private String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
