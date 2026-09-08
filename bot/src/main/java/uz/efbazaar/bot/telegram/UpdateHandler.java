package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.partner.ChannelVerifier;
import uz.efbazaar.bot.referral.PendingReferralClient;
import uz.efbazaar.bot.settings.BotSettingsClient;
import uz.efbazaar.bot.settings.BotSettingsClient.BotSettingsView;
import uz.efbazaar.bot.telegram.TelegramApiClient.UrlButton;
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
    private final PendingReferralClient pendingReferrals;
    private final PremiumEmojiInspector premiumEmoji;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @Value("${app.telegram.bot-username:}")
    private String botUsername;

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
            String code = startPayload(text);
            if (code != null) {
                // Salomlashishdan OLDIN: kod yo'qolsa referal yo'qoladi,
                // salomlashish esa keyingi /start da baribir keladi.
                //
                // `from`, `chat` emas: shaxsiy chatda ular teng, lekin
                // odamni ko'rsatadigani `from`.
                pendingReferrals.remember(message.path("from").path("id").asLong(), code);
            }
            sendStart(chatId);
        } else if (text.startsWith("/help")) {
            sendHelp(chatId);
        } else if (text.startsWith("/partner")) {
            sendPartner(chatId);
        } else if (text.startsWith("/emoji")) {
            // Ichki asbob: custom emoji'ning id'sini aytadi. /help da ATAYLAB
            // yo'q — u oddiy foydalanuvchiga hech narsa bermaydi. Yopilmagan
            // ham: javob faqat yuboruvchining O'Z xabaridan o'qiladi, ya'ni
            // tizim haqida hech narsa oshkor qilmaydi.
            telegram.sendMessage(String.valueOf(chatId), null,
                    premiumEmoji.describe(message));
        }
        // Boshqa xabarlar: ignore
    }

    /** Kod shakli — ReferralCodeService dagi alifbo va uzunlik. */
    private static final java.util.regex.Pattern REFERRAL_CODE =
            java.util.regex.Pattern.compile("^[A-Z0-9]{8}$");

    /**
     * {@code /start ref_ABCD2345} dan kodni ajratadi.
     *
     * <p>Telegram chuqur havolasi ({@code t.me/<bot>?start=ref_ABCD2345})
     * yukni aynan shu ko'rinishda yetkazadi.
     *
     * <p>{@code ref_} prefiksi bo'lmagan yuk jimgina o'tkazib
     * yuboriladi: kelajakda boshqa chuqur havolalar ham bo'lishi mumkin
     * va ular bu yerda xato bermasligi kerak.
     *
     * @return kod, yoki bu referal yuki bo'lmasa null
     */
    static String startPayload(String text) {
        if (text == null) return null;
        String[] parts = text.trim().split("\\s+", 2);
        if (parts.length < 2) return null;

        String payload = parts[1].trim();
        if (!payload.startsWith("ref_")) return null;

        String code = payload.substring("ref_".length()).toUpperCase();
        return REFERRAL_CODE.matcher(code).matches() ? code : null;
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

    /** Bot username, "@" siz. Sozlanmagan bo'lsa bo'sh. */
    private String safeUsername() {
        String name = botUsername;
        return name == null ? "" : name.replace("@", "").trim();
    }

    private String url(String path) {
        String base = webBaseUrl == null ? "" : webBaseUrl;
        return base.endsWith("/") ? base.substring(0, base.length() - 1) + path : base + path;
    }

    /**
     * Kanalni bog'lash uchun tayyor tugma.
     *
     * <p>Telegram'ning {@code ?startchannel} chuqur havolasi kanal tanlash
     * oynasini ochadi va botni darhol administrator qilib tayinlaydi.
     * Foydalanuvchi kanal sozlamalari ichida yo'l qidirmaydi — bu qadam
     * aynan shu yerda adashib qolinadigan joy edi.
     */
    private void sendPartner(long chatId) {
        String bot = safeUsername();
        if (bot.isEmpty()) {
            telegram.sendMessage(String.valueOf(chatId), null,
                    "Bot nomi sozlanmagan. Administratorga xabar bering.");
            return;
        }

        String text = "🤝 <b>Hamkorlik</b>\n\n"
                + "Kanalingizni bog'lash uchun:\n\n"
                + "1. Pastdagi tugmani bosing\n"
                + "2. Ro'yxatdan kanalingizni tanlang\n"
                + "3. \"Add Bot as Admin\" ni tasdiqlang\n\n"
                + "Shundan keyin obunachilar soni va kanal egasi avtomatik tekshiriladi.\n\n"
                + "⚠️ Botni <b>kanal egasi</b> qo'shishi kerak — administrator bo'lsangiz "
                + "ham yetarli emas.";

        telegram.sendMessageWithUrlButton(String.valueOf(chatId), text,
                new UrlButton("📢 Kanalga qo'shish",
                        "https://t.me/" + bot + "?startchannel&admin=post_messages"));
    }

    private void sendHelp(long chatId) {
        String text = "ℹ️ <b>Yordam</b>\n\n"
                + "Bot orqali siz quyidagi amallarni bajarishingiz mumkin:\n"
                + "• /start — botni qayta ishga tushirish\n"
                + "• /help — yordam ko'rsatish\n"
                + "• /partner — kanalingizni hamkorlikka bog'lash\n\n"
                + "Aksariyat amallar saytda — pastdagi tugma orqali oching.";
        telegram.sendMessageWithKeyboard(String.valueOf(chatId), text, startKeyboard());
    }
}
