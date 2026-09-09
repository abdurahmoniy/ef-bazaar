package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Instant;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class SupportMessageConsumer {

    private final TelegramApiClient telegram;
    private final TelegramProperties props;
    private final KafkaTemplate<String, Object> kafka;

    @KafkaListener(
            topics = "efbazaar.marketplace.support-message-created",
            groupId = "bot-support-messages",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.SupportMessageCreatedDto"}
    )
    public void onMessageCreated(SupportMessageCreatedDto e) {
        if (e == null || e.chatId() == null) {
            log.warn("Received empty support message event");
            return;
        }

        if (!StringUtils.hasText(props.groupChatId())) {
            log.warn("TELEGRAM_GROUP_CHAT_ID is not configured — skipping support message chatId={}", e.chatId());
            return;
        }

        Integer topicId = props.topics() != null ? props.topics().support() : null;
        if (topicId == null) {
            log.warn("TELEGRAM_TOPIC_SUPPORT is not configured — skipping support message chatId={}", e.chatId());
            return;
        }

        String formattedText = formatTelegramText(e);
        try {
            Optional<Integer> sentMsgId = telegram.sendMessageWithReply(
                    props.groupChatId(),
                    topicId,
                    formattedText,
                    e.replyToTelegramMessageId()
            );

            if (sentMsgId.isPresent()) {
                long telegramMsgId = sentMsgId.get().longValue();
                log.info("Posted support message to Telegram: chatId={} msgId={} telegramMsgId={}",
                        e.chatId(), e.messageId(), telegramMsgId);

                try {
                    kafka.send("efbazaar.bot.support-message-bound", e.chatId().toString(),
                            new SupportMessageBoundDto(e.chatId(), e.messageId(), telegramMsgId, Instant.now()));
                } catch (Exception kex) {
                    log.error("Failed to publish support message bound event to Kafka: chatId={}", e.chatId(), kex);
                }
            } else {
                log.warn("Telegram failed to deliver support message for chatId={}", e.chatId());
            }
        } catch (Exception ex) {
            log.error("Error sending support message to Telegram topic: chatId={}", e.chatId(), ex);
        }
    }

    private String formatTelegramText(SupportMessageCreatedDto e) {
        String catLabel = switch (e.category() != null ? e.category() : "") {
            case "PARTNERSHIP" -> "🤝 #Hamkorlik";
            case "QUESTION" -> "❓ #Savol";
            default -> "🛠 #Yordam";
        };

        boolean isInitial = (e.replyToTelegramMessageId() == null);
        StringBuilder sb = new StringBuilder();
        if (isInitial) {
            sb.append("💬 <b>").append(catLabel).append(" | Yangi murojaat</b>\n\n");
        } else {
            sb.append("💬 <b>").append(catLabel).append(" | Yangi xabar</b>\n\n");
        }

        sb.append("👤 <b>Kimdan:</b> ").append(escape(e.senderName()));
        if (StringUtils.hasText(e.senderContact())) {
            sb.append(" (").append(escape(e.senderContact())).append(")");
        }
        sb.append("\n");

        String chatIdStr = e.chatId().toString();
        String shortChatId = chatIdStr.length() >= 8 ? chatIdStr.substring(0, 8) : chatIdStr;
        sb.append("🆔 <b>Chat ID:</b> <code>#").append(shortChatId).append("</code>\n");
        sb.append("────────────────────\n");
        sb.append(escape(e.content()));

        return sb.toString();
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
