package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.WebAppButton;

import java.util.List;

/**
 * To'langan hamkorlik arizasi haqida adminlarga Telegramga xabar yuboradi.
 *
 * <p>Manzillar hodisa ichida keladi — bot rollarni bilmaydi va bilishi ham
 * shart emas. Kimga yozishni marketplace hal qiladi.
 *
 * <p>Yetkazib bo'lmagan xabar YUTILADI: admin botni ishga tushirmagan
 * bo'lishi mumkin va bu ariza oqimini to'xtatishga sabab emas — ariza
 * baribir admin panelida ishora bilan turadi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerApplicationConsumer {

    private final TelegramApiClient telegram;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @KafkaListener(
            topics = "efbazaar.marketplace.partner-application-submitted",
            groupId = "bot-partner-applications",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.PartnerApplicationDto"}
    )
    public void onApplication(PartnerApplicationDto e) {
        if (e == null || e.adminTelegramIds() == null || e.adminTelegramIds().isEmpty()) {
            log.info("partner-application-submitted without admin addresses — nothing to send");
            return;
        }

        String text = "🤝 <b>Yangi hamkorlik arizasi</b>\n\n"
                + "<b>Kanal:</b> " + escape(e.channelTitle()) + username(e.channelUsername()) + "\n"
                + "<b>Obunachilar:</b> " + (e.subscriberCount() == null ? "—" : e.subscriberCount()) + "\n\n"
                + "To'lov o'tdi, ariza ko'rikni kutmoqda.";

        var button = new WebAppButton("Arizani ochish", webBaseUrl + "/admin/partners");

        for (Long chatId : e.adminTelegramIds()) {
            if (chatId == null) continue;
            telegram.sendMessage(String.valueOf(chatId), null, text, button);
        }
        log.info("Partner application {} announced to {} admin(s)",
                e.applicationId(), e.adminTelegramIds().size());
    }

    private String username(String channelUsername) {
        return channelUsername == null || channelUsername.isBlank()
                ? "" : " (@" + escape(channelUsername) + ")";
    }

    private String escape(String s) {
        if (s == null) return "—";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
