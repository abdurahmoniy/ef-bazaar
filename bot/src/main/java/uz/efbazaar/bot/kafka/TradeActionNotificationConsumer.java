package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;

/**
 * Sends Telegram DM notifications to buyers/sellers when trade actions occur.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeActionNotificationConsumer {

    private final TelegramApiClient telegram;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @KafkaListener(
            topics = "efbazaar.notifications.trade-action",
            groupId = "bot-trade-action-notifier",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.bot.kafka.TradeActionNotificationDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onTradeAction(TradeActionNotificationDto e) {
        if (e == null || e.recipientTelegramId() == null) {
            log.info("Skipping trade action DM — no Telegram identity");
            return;
        }

        String message = buildMessage(e);
        String targetUrl = e.chatId() != null
                ? webBaseUrl + "/chats/" + e.chatId()
                : webBaseUrl + "/chats";
        var button = new TelegramApiClient.WebAppButton("💬 Savdoni ochish", targetUrl);

        try {
            telegram.sendMessage(String.valueOf(e.recipientTelegramId()), null, message, button);
            log.info("Trade action DM sent to telegramId={} actionType={} chatId={}",
                    e.recipientTelegramId(), e.actionType(), e.chatId());
        } catch (Exception ex) {
            log.warn("Trade action DM failed for telegramId={}: {}", e.recipientTelegramId(), ex.getMessage());
        }
    }

    private String buildMessage(TradeActionNotificationDto e) {
        String action = e.actionType() != null ? e.actionType() : "";
        boolean swap = !hasAmount(e.amountUzs());
        String formattedPrice = String.format("%,d", e.amountUzs()).replace(',', ' ') + " UZS";
        return switch (action) {
            case "PROPOSAL_CREATED" -> "🤝 <b>Yangi savdo taklifi!</b>\n"
                    + (swap
                        ? "Sizga <b>obmen</b> taklifi yuborildi — akkountga akkount.\n"
                        : "Sizga <b>" + formattedPrice + "</b> miqdorida savdo taklifi yuborildi.\n")
                    + "Savdoni davom ettirish uchun chatga kiring.";
            case "TRADE_STARTED" -> "🚀 <b>Savdo boshlandi!</b>\n"
                    + (swap
                        ? "Obmen taklifi qabul qilindi."
                        : "Taklif qabul qilindi (" + formattedPrice + ").")
                    + " Akkount transferi boshlanmoqda.";
            case "EMAIL_CHANGED" -> "📧 <b>Konami emaili o'zgartirildi</b>\n"
                    + "Sotuvchi Konami emailini almashtirdi. Tekshiruv davom etmoqda.";
            case "PASSWORD_SENT" -> "🔑 <b>Konami paroli yuborildi!</b>\n"
                    + "Sotuvchi yangi parolni yubordi. Chatga kirib parolni ko'ring va tasdiqlang.";
            case "TRADE_SUCCESS" -> "✅ <b>Savdo muvaffaqiyatli yakunlandi!</b>\n"
                    + "Mablag' va akkount muvaffaqiyatli o'tkazildi. Tabriklaymiz!";
            case "TRADE_REJECTED" -> "❌ <b>Savdo rad etildi</b>\n"
                    + "Savdo bekor qilindi.";
            case "TRADE_ORPHANED" -> "⏱ <b>Savdo muddati tugadi</b>\n"
                    + "Ajratilgan vaqt tugaganligi sababli savdo bekor qilindi.";
            default -> "🔔 <b>Savdo yangilandi</b>\n"
                    + "Savdo holatida o'zgarish yuz berdi.";
        };
    }

    /**
     * Ko'rsatiladigan summa bormi.
     *
     * <p>Toza obmenda pul umuman o'tmaydi va summa 0 bo'lib keladi — DM da esa
     * "0 UZS" chiqib, savdo buzuq ochilgandek ko'rinardi. Hodisada savdo turi
     * yo'q, lekin sotuvda narx hech qachon 0 bo'lmaydi (marketplace eng kam
     * narxni talab qiladi), shuning uchun 0 summa obmen belgisi. Doplatali
     * obmenda doplataning o'zi ko'rsatiladi — sayt ham shu qoida bilan
     * ishlaydi ({@code trade-swap.ts}).
     */
    private static boolean hasAmount(long amountUzs) {
        return amountUzs > 0;
    }
}
