package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * Forwards new user registrations to the Telegram registration topic.
 * Source event: {@code efbazaar.auth.user-registered} (Telegram-first model).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RegistrationEventConsumer {

    private static final DateTimeFormatter TS_FMT = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.of("Asia/Tashkent"));

    private final TelegramApiClient telegram;
    private final TelegramProperties props;

    @KafkaListener(
            topics = "efbazaar.auth.user-registered",
            groupId = "bot-registration-forwarder",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.UserRegisteredDto"}
    )
    public void onUserRegistered(UserRegisteredDto event) {
        try {
            String html = "👤 <b>Yangi foydalanuvchi ro'yxatdan o'tdi</b>\n" +
                    "<b>Ism:</b> " + escape(event.displayName()) + "\n" +
                    "<b>Telegram:</b> <a href=\"tg://user?id=" + event.telegramId() + "\">" +
                        event.telegramId() + "</a>\n" +
                    "<b>User ID:</b> <code>" + event.userId() + "</code>\n" +
                    "<b>Vaqt:</b> <i>" + TS_FMT.format(event.occurredAt()) + "</i>";
            telegram.sendMessage(props.groupChatId(), props.topics().registration(), html);
            log.info("Registration forwarded to Telegram: userId={} tgId={}",
                    event.userId(), event.telegramId());
        } catch (Exception e) {
            log.error("Failed to forward registration to Telegram: {}", e.getMessage(), e);
        }
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
