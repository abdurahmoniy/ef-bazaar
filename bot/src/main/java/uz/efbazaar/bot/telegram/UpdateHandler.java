package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.partner.ChannelVerifier;
import uz.efbazaar.bot.settings.BotSettingsClient;
import uz.efbazaar.bot.settings.BotSettingsClient.BotSettingsView;
import uz.efbazaar.bot.telegram.TelegramApiClient.WebAppButton;

import java.util.List;

/**
 * Telegram dan kelgan update larni qayta ishlaydi.
 * MVP: /start, /help. Telegram Login flow web side (Login Widget) da boshqariladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UpdateHandler {

    private final TelegramApiClient telegram;
    private final BotSettingsClient settings;
    private final ChannelVerifier channels;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    public void handle(JsonNode update) {
        // Bot kanalga admin qilib qo'shildi (yoki maqomi o'zgardi) —
        // hamkorlik oqimidagi kanal tekshiruvi shu yerdan boshlanadi.
        JsonNode myChatMember = update.path("my_chat_member");
        if (!myChatMember.isMissingNode()) {
            channels.handle(myChatMember);
            return;
        }

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

    /**
     * Xush kelibsiz xabari. Matn ham, banner ham adminkadan boshqariladi —
     * ikkalasi ham marketplace-service'dan keladi va u yerda tahrirlanadi.
     *
     * <p>Banner bo'lsa rasm + izoh, bo'lmasa oddiy matn yuboriladi. Bu ikki
     * yo'lning farqi bitta: Telegram rasm izohini 1024 belgi bilan cheklaydi,
     * oddiy xabarni esa 4096 bilan. Uzunlik adminkada saqlash paytida
     * tekshiriladi, shuning uchun bu yerda qayta o'lchamaymiz.
     */
    private void sendStart(long chatId) {
        BotSettingsView view = settings.get();
        List<List<WebAppButton>> keyboard = startKeyboard();
        String chat = String.valueOf(chatId);

        if (view.bannerFileId() != null && !view.bannerFileId().isBlank()) {
            var sent = telegram.sendPhotoWithKeyboard(
                    chat, view.bannerFileId(), view.welcomeText(), keyboard);
            if (sent.isPresent()) return;

            // Banner yuborilmadi — file_id eskirgan yoki Telegram rad etdi.
            // Foydalanuvchini bo'sh qoldirmaslik uchun matnning o'zini yuboramiz.
            log.warn("Banner bilan yuborib bo'lmadi (chatId={}), matnli xabarga o'tildi", chatId);
        }

        telegram.sendMessageWithKeyboard(chat, view.welcomeText(), keyboard);
    }

    /**
     * Uch tugma, ikki qator. Hammasi {@code web_app} — ya'ni Mini App
     * Telegram ichida ochiladi, brauzerga chiqib ketmaydi. Bu tugmalar
     * faqat shaxsiy chatda ishlaydi; /start esa aynan shaxsiy chatda keladi.
     */
    private List<List<WebAppButton>> startKeyboard() {
        return List.of(
                List.of(new WebAppButton("🛒 Bozorni ochish", url("/marketplace"))),
                List.of(
                        new WebAppButton("📋 E'lon joylash", url("/marketplace/new")),
                        new WebAppButton("❓ Yordam", url("/help"))));
    }

    private String url(String path) {
        String base = webBaseUrl == null ? "" : webBaseUrl;
        return base.endsWith("/") ? base.substring(0, base.length() - 1) + path : base + path;
    }

    private void sendHelp(long chatId) {
        String text = "ℹ️ <b>Yordam</b>\n\n"
                + "Bot orqali siz quyidagi amallarni bajarishingiz mumkin:\n"
                + "• /start — botni qayta ishga tushirish\n"
                + "• /help — yordam ko'rsatish\n\n"
                + "Aksariyat amallar saytda — pastdagi tugma orqali oching.";
        telegram.sendMessageWithKeyboard(String.valueOf(chatId), text, startKeyboard());
    }
}
