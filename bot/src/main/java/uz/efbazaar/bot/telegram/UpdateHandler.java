package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.config.TelegramProperties;

/**
 * Telegram dan kelgan update larni qayta ishlaydi.
 * MVP: /start, /help. Telegram Login flow web side (Login Widget) da boshqariladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UpdateHandler {

    private final TelegramApiClient telegram;
    private final TelegramProperties props;

    public void handle(JsonNode update) {
        JsonNode message = update.path("message");
        if (message.isMissingNode()) return;

        String text = message.path("text").asText("");
        long chatId = message.path("chat").path("id").asLong();

        if (text.startsWith("/start")) {
            sendStart(chatId);
        } else if (text.startsWith("/help")) {
            sendHelp(chatId);
        }
        // Boshqa xabarlar: ignore
    }

    private void sendStart(long chatId) {
        String text = "👋 <b>Salom! Men <a href=\"https://t.me/" + safeUsername() + "\">@" + safeUsername()
                + "</a> botiman.</b>\n\n"
                + "efBazaar — eFootball akkountlar bozori.\n\n"
                + "Akkauntingizni Telegram bilan bog'lash uchun saytda profilingizga kirib, "
                + "\"Telegram orqali bog'lash\" tugmasini bosing.";
        telegram.sendMessage(String.valueOf(chatId), null, text);
    }

    private void sendHelp(long chatId) {
        String text = "ℹ️ <b>Yordam</b>\n\n"
                + "Bot orqali siz quyidagi amallarni bajarishingiz mumkin:\n"
                + "• /start — botni qayta ishga tushirish\n"
                + "• /help — yordam ko'rsatish\n\n"
                + "Aksariyat amallar saytda: <a href=\"" + escape(props.botUsername()) + "\">efBazaar</a>";
        telegram.sendMessage(String.valueOf(chatId), null, text);
    }

    private String safeUsername() {
        return props.botUsername() == null ? "" : props.botUsername().replace("@", "");
    }

    private String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
