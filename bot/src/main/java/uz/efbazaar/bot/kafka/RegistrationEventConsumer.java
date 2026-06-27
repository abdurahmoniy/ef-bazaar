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
 * Forwards user registration and verification events to the Telegram
 * registration topic.
 * <ul>
 *   <li>{@code efbazaar.auth.user-registered} — new Telegram register</li>
 *   <li>{@code efbazaar.auth.google-linked}   — Google link → verified</li>
 * </ul>
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
    public void onUserRegistered(UserRegisteredDto e) {
        try {
            String html = "👤 <b>Yangi foydalanuvchi ro'yxatdan o'tdi</b>\n" +
                    "<b>Ism:</b> " + escape(e.displayName()) + "\n" +
                    usernameLine(e.telegramUsername()) +
                    "<b>Telegram ID:</b> <a href=\"tg://user?id=" + e.telegramId() + "\"><code>" +
                        e.telegramId() + "</code></a>\n" +
                    "<b>User ID:</b> <code>" + e.userId() + "</code>\n" +
                    "<b>Vaqt:</b> <i>" + TS_FMT.format(e.occurredAt()) + "</i>";
            send(html, "registered userId=" + e.userId());
        } catch (Exception ex) {
            log.error("Failed to forward UserRegistered: {}", ex.getMessage(), ex);
        }
    }

    @KafkaListener(
            topics = "efbazaar.auth.google-linked",
            groupId = "bot-registration-forwarder",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.GoogleLinkedDto"}
    )
    public void onGoogleLinked(GoogleLinkedDto e) {
        try {
            String html = "🛡 <b>Foydalanuvchi tasdiqlandi (Google)</b>\n" +
                    "<b>Ism:</b> " + escape(e.displayName()) + "\n" +
                    usernameLine(e.telegramUsername()) +
                    "<b>Telegram ID:</b> <a href=\"tg://user?id=" + e.telegramId() + "\"><code>" +
                        e.telegramId() + "</code></a>\n" +
                    "<b>Email:</b> <code>" + escape(e.email()) + "</code>\n" +
                    "<b>User ID:</b> <code>" + e.userId() + "</code>\n" +
                    "<b>Vaqt:</b> <i>" + TS_FMT.format(e.occurredAt()) + "</i>";
            send(html, "google-linked userId=" + e.userId());
        } catch (Exception ex) {
            log.error("Failed to forward GoogleLinked: {}", ex.getMessage(), ex);
        }
    }

    private void send(String html, String diag) {
        telegram.sendMessage(props.groupChatId(), props.topics().registration(), html);
        log.info("Registration topic ← {}", diag);
    }

    private static String usernameLine(String username) {
        return username == null || username.isBlank()
                ? ""
                : "<b>Username:</b> @" + escape(username) + "\n";
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
