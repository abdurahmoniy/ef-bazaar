package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.Optional;

/**
 * Sends a Telegram DM to the seller when a buyer opens a chat on one of their
 * listings. Payload comes pre-enriched from auth-service on the
 * {@code efbazaar.notifications.chat-created} topic.
 *
 * <p>DM delivery requires the seller to have started the bot at least once —
 * for sellers who haven't, {@code sendMessage} will 403 and the failure is
 * logged and swallowed rather than escalated. That matches how the rest of the
 * bot handles Telegram outages: chat state in the marketplace is the source of
 * truth; DMs are a best-effort push.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatNotificationConsumer {

    private final TelegramApiClient telegram;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    @KafkaListener(
            topics = "efbazaar.notifications.chat-created",
            groupId = "bot-chat-notifier",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.ChatNotificationDto"}
    )
    public void onChatNotification(ChatNotificationDto e) {
        if (e.sellerTelegramId() == null) {
            log.info("Skipping chat DM for sellerId={} — no Telegram identity", e.sellerId());
            return;
        }

        String message = buildMessage(e);
        try {
            Optional<Integer> messageId = telegram.sendMessage(
                    String.valueOf(e.sellerTelegramId()), null, message);
            if (messageId.isEmpty()) {
                log.warn("Chat DM not delivered to sellerTelegramId={} chatId={}",
                        e.sellerTelegramId(), e.chatId());
            } else {
                log.info("Chat DM sent to sellerTelegramId={} chatId={} messageId={}",
                        e.sellerTelegramId(), e.chatId(), messageId.get());
            }
        } catch (Exception ex) {
            log.warn("Chat DM failed for sellerTelegramId={} chatId={}: {}",
                    e.sellerTelegramId(), e.chatId(), ex.getMessage());
        }
    }

    private String buildMessage(ChatNotificationDto e) {
        String buyerLabel = e.buyerTelegramUsername() != null && !e.buyerTelegramUsername().isBlank()
                ? "@" + escape(e.buyerTelegramUsername())
                : escape(e.buyerDisplayName() != null ? e.buyerDisplayName() : "Xaridor");
        String chatUrl = webBaseUrl + "/chats/" + e.chatId();
        String listingUrl = webBaseUrl + "/marketplace/" + e.listingId();
        return "💬 <b>Yangi chat</b>\n"
                + buyerLabel + " sizning "
                + "<a href=\"" + listingUrl + "\">e'loningiz</a> uchun bog'landi.\n\n"
                + "Ochish: " + chatUrl;
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
