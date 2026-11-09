package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.util.StringUtils;
import uz.efbazaar.bot.access.AccessCheckClient;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.kafka.SupportReplyReceivedDto;
import uz.efbazaar.bot.partner.ChannelVerifier;
import uz.efbazaar.bot.guide.GuideMessenger;
import uz.efbazaar.bot.referral.PendingReferralClient;
import uz.efbazaar.bot.settings.BotSettingsClient;
import uz.efbazaar.bot.settings.BotSettingsClient.BotSettingsView;
import uz.efbazaar.bot.telegram.TelegramApiClient.UrlButton;
import uz.efbazaar.bot.telegram.TelegramApiClient.WebAppButton;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Telegram dan kelgan update larni qayta ishlaydi.
 * MVP: /start, /help. Telegram Login flow web side (Login Widget) da boshqariladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UpdateHandler {

    private final TelegramApiClient telegram;
    private final AccessCheckClient access;
    private final BotSettingsClient settings;
    private final ChannelVerifier channels;
    private final PendingReferralClient pendingReferrals;
    private final PremiumEmojiInspector premiumEmoji;
    private final GuideMessenger guides;
    private final TelegramProperties props;
    private final KafkaTemplate<String, Object> kafka;
    private final uz.efbazaar.bot.inline.InlineQueryHandler inline;
    private final uz.efbazaar.bot.campaign.CampaignStartClient campaigns;
    private final uz.efbazaar.bot.channel.ChannelMemberTracker channelMembers;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @Value("${app.telegram.bot-username:}")
    private String botUsername;

    public void handle(JsonNode update) {
        // Bot kanalga admin qilib qo'shildi (yoki maqomi o'zgardi) —
        // hamkorlik oqimidagi kanal tekshiruvi shu yerdan boshlanadi.
        // Boshqa odamning kanalga obunasi/chiqishi (my_chat_member — botning o'zi).
        JsonNode chatMember = update.path("chat_member");
        if (!chatMember.isMissingNode()) {
            channelMembers.handle(chatMember);
            return;
        }

        JsonNode myChatMember = update.path("my_chat_member");
        if (!myChatMember.isMissingNode()) {
            channels.handle(myChatMember);
            return;
        }

        // `@EfBazaarBot` inline rejimi — foydalanuvchi o'z e'lonini ulashmoqda.
        JsonNode inlineQuery = update.path("inline_query");
        if (!inlineQuery.isMissingNode()) {
            inline.handle(inlineQuery);
            return;
        }

        // Inline tugma bosildi — qo'llanma so'ralgan.
        JsonNode callbackQuery = update.path("callback_query");
        if (!callbackQuery.isMissingNode()) {
            if (callbackQuery.path("data").asText("").startsWith(ACCESS_CALLBACK)) {
                onAccessCallback(callbackQuery);
                return;
            }
            guides.onCallback(callbackQuery);
            return;
        }

        JsonNode message = update.path("message");
        if (message.isMissingNode()) return;

        long chatId = message.path("chat").path("id").asLong();

        // Murojaatlar topicidagi reply javoblar (admin saytdagi foydalanuvchiga javob berishi)
        if (handleSupportTopicReply(message, chatId)) {
            return;
        }

        String text = message.path("text").asText("");

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
            String campaign = campaignPayload(text);
            if (campaign != null) {
                // Referal kabi salomlashishdan va kirish shartlaridan OLDIN:
                // obuna so'ralgan odam ham manbasini yo'qotmasligi kerak.
                campaigns.remember(message.path("from").path("id").asLong(), campaign);
            }
            UUID guideId = guidePayload(text);

            // Kirish shartlari: bajarilmagan bo'lsa web app tugmalari o'rniga
            // obuna xabari. Referal yuqorida saqlangan, qo'llanma id si esa
            // "Obuna bo'ldim" tugmasiga yoziladi — obunadan keyin ikkalasi
            // ham yo'qolmaydi.
            List<AccessCheckClient.Requirement> unmet =
                    access.unmet(message.path("from").path("id").asLong());
            if (!unmet.isEmpty()) {
                sendAccessGate(chatId, unmet, guideId);
                return;
            }
            sendWelcome(chatId, guideId);
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

    /**
     * "Obuna bo'ldim" tugmasining callback'i. Qo'llanma havolasi bilan kelgan
     * bo'lsa id qo'shiladi: {@code access:check:<uuid>} — 49 bayt, Telegram
     * chegarasi 64.
     */
    static final String ACCESS_CALLBACK = "access:check";

    /** Salomlashish va qo'llanmalar — shartlar bajarilgan (yoki tekshirib bo'lmagan) holat. */
    private void sendWelcome(long chatId, UUID guideId) {
        sendStart(chatId);
        if (guideId != null) {
            boolean sent = guides.sendGuide(chatId, guideId);
            if (!sent) {
                guides.sendList(chatId);
            }
        } else {
            // Salomlashishdan KEYIN alohida xabar. Bitta xabarga
            // qo'shsak, /start matni va qo'llanmalar bir-birini bosardi;
            // ustiga banner qo'yilgan bo'lsa izoh chegarasi 1024 ga
            // tushadi va matn kesilardi.
            guides.sendList(chatId);
        }
    }

    /**
     * Shartlar bajarilmagan: kanallarga havolalar va "Obuna bo'ldim" tugmasi.
     * Web app tugmalari ATAYLAB yo'q. Bu yagona to'siq emas — Mini App
     * ochilganda auth-service ham tekshiradi — lekin botda ochiq tugma
     * "kirsa bo'ladi" degan noto'g'ri signal berardi.
     */
    private void sendAccessGate(long chatId, List<AccessCheckClient.Requirement> unmet, UUID guideId) {
        String text = "🔒 <b>Botdan foydalanish uchun obuna bo'ling</b>\n\n"
                + "efBazaar'dan foydalanish uchun quyidagi "
                + (unmet.size() > 1 ? "kanallarga" : "kanalga")
                + " obuna bo'ling, so'ng «✅ Obuna bo'ldim» tugmasini bosing.";
        List<UrlButton> links = unmet.stream()
                .filter(r -> r.url() != null && !r.url().isBlank())
                .map(r -> new UrlButton("📢 " + r.label(), r.url()))
                .toList();
        String data = guideId == null ? ACCESS_CALLBACK : ACCESS_CALLBACK + ":" + guideId;
        telegram.sendMessageWithLinksAndAction(String.valueOf(chatId), text, links,
                new TelegramApiClient.CallbackButton("✅ Obuna bo'ldim", data));
    }

    private void onAccessCallback(JsonNode callbackQuery) {
        String callbackId = callbackQuery.path("id").asText("");
        long userId = callbackQuery.path("from").path("id").asLong();
        JsonNode message = callbackQuery.path("message");
        long chatId = message.path("chat").path("id").asLong();
        if (chatId == 0) return;

        if (!access.unmet(userId).isEmpty()) {
            telegram.answerCallbackQuery(callbackId,
                    "Hali barcha kanallarga obuna bo'lmadingiz. Obuna bo'lib, qayta bosing.", true);
            return;
        }

        telegram.answerCallbackQuery(callbackId, "✅ Rahmat! Obuna tasdiqlandi", false);
        // Eski obuna xabari chatda qolmasin — tugmasi endi keraksiz.
        if (message.has("message_id")) {
            telegram.deleteMessage(String.valueOf(chatId), message.path("message_id").asLong());
        }
        sendWelcome(chatId, accessCallbackGuideId(callbackQuery.path("data").asText("")));
    }

    static UUID accessCallbackGuideId(String data) {
        if (data == null || !data.startsWith(ACCESS_CALLBACK + ":")) return null;
        try {
            return UUID.fromString(data.substring(ACCESS_CALLBACK.length() + 1));
        } catch (IllegalArgumentException e) {
            return null;
        }
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
     * {@code /start c_GRP23456} dan kampaniya kodini ajratadi.
     *
     * <p>Shakl — marketplace'dagi {@code CampaignService} va brauzerdagi
     * {@code campaign-capture.ts} bilan bir xil. Referal yuki ({@code ref_})
     * bu yerda o'qilmaydi: ikkalasi boshqa-boshqa savolga javob beradi.
     *
     * @return kod, yoki bu kampaniya yuki bo'lmasa null
     */
    static String campaignPayload(String text) {
        if (text == null) return null;
        String[] parts = text.trim().split("\\s+", 2);
        if (parts.length < 2) return null;

        String payload = parts[1].trim();
        if (!payload.startsWith("c_")) return null;

        String code = payload.substring("c_".length()).toUpperCase();
        return REFERRAL_CODE.matcher(code).matches() ? code : null;
    }

    /**
     * {@code /start guide_<UUID>} dan qo'llanma ID sini ajratadi.
     */
    static UUID guidePayload(String text) {
        if (text == null) return null;
        String[] parts = text.trim().split("\\s+", 2);
        if (parts.length < 2) return null;

        String payload = parts[1].trim();
        if (!payload.startsWith("guide_")) return null;

        String rawId = payload.substring("guide_".length()).trim();
        try {
            return UUID.fromString(rawId);
        } catch (IllegalArgumentException e) {
            return null;
        }
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

    private boolean handleSupportTopicReply(JsonNode message, long chatId) {
        try {
            if (!StringUtils.hasText(props.groupChatId())) return false;
            if (!props.groupChatId().equals(String.valueOf(chatId))) return false;

            Integer topicId = props.topics() != null ? props.topics().support() : null;
            if (topicId == null) return false;

            int messageThreadId = message.path("message_thread_id").asInt(0);
            if (messageThreadId != topicId) return false;

            JsonNode replyTo = message.path("reply_to_message");
            if (replyTo == null || replyTo.isMissingNode() || replyTo.isNull()) return false;

            long replyToId = replyTo.path("message_id").asLong(0);
            long messageId = message.path("message_id").asLong(0);
            if (replyToId <= 0 || messageId <= 0) return false;

            String text = message.path("text").asText("");
            if (text.isBlank()) {
                text = message.path("caption").asText("");
            }
            if (text.isBlank()) return false;

            JsonNode from = message.path("from");
            String firstName = from.path("first_name").asText("");
            String lastName = from.path("last_name").asText("");
            String adminName = (firstName + " " + lastName).trim();
            String adminUsername = from.hasNonNull("username") ? from.path("username").asText() : null;

            var event = new SupportReplyReceivedDto(
                    replyToId,
                    messageId,
                    adminName,
                    adminUsername,
                    text.trim(),
                    Instant.now()
            );

            try {
                kafka.send("efbazaar.bot.support-reply-received", String.valueOf(replyToId), event)
                        .whenComplete((res, ex) -> {
                            if (ex != null) {
                                log.error("Failed to publish support reply event: replyToId={}", replyToId, ex);
                            } else {
                                log.info("Published support reply event: replyToId={} messageId={}", replyToId, messageId);
                            }
                        });
            } catch (Exception ex) {
                log.error("Synchronous error publishing support reply event: replyToId={}", replyToId, ex);
            }

            return true;
        } catch (Exception ex) {
            log.error("Error handling support topic reply: chatId={}", chatId, ex);
            return false;
        }
    }
}
