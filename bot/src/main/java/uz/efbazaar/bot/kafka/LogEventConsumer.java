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
 * Boshqa servislardan kelgan WARN/ERROR loglarini Telegram logs topikiga uzatadi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LogEventConsumer {

    private static final DateTimeFormatter TS_FMT = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.of("Asia/Tashkent"));

    private static final int MAX_TEXT_LENGTH = 3500;  // Telegram limit 4096, qoldiq margin

    private final TelegramApiClient telegram;
    private final TelegramProperties props;

    @KafkaListener(
            topics = "efbazaar.system.log-event",
            groupId = "bot-log-forwarder",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.LogEventDto"}
    )
    public void onLog(LogEventDto event) {
        try {
            String html = formatHtml(event);
            telegram.sendMessage(props.groupChatId(), props.topics().logs(), html);
        } catch (Exception e) {
            log.error("Failed to forward log to Telegram: {}", e.getMessage());
        }
    }

    private String formatHtml(LogEventDto e) {
        String icon = "ERROR".equalsIgnoreCase(e.level()) ? "🔴" : "🟠";
        StringBuilder sb = new StringBuilder();
        sb.append(icon).append(" <b>").append(escape(e.level())).append("</b> ")
          .append("<code>").append(escape(e.service())).append("</code>\n");
        sb.append("<i>").append(TS_FMT.format(e.timestamp())).append("</i>\n");
        sb.append("<b>logger:</b> <code>").append(escape(shortLogger(e.logger()))).append("</code>\n");
        sb.append("<b>thread:</b> <code>").append(escape(e.thread())).append("</code>\n");
        sb.append("\n").append("<pre>").append(escape(e.message())).append("</pre>");

        if (e.stackTrace() != null && !e.stackTrace().isBlank()) {
            sb.append("\n\n<pre>").append(escape(truncate(e.stackTrace(), 1500))).append("</pre>");
        }
        return truncate(sb.toString(), MAX_TEXT_LENGTH);
    }

    private static String shortLogger(String fqn) {
        if (fqn == null) return "";
        int lastDot = fqn.lastIndexOf('.');
        return lastDot < 0 ? fqn : fqn.substring(lastDot + 1);
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        if (s.length() <= max) return s;
        return s.substring(0, max - 3) + "...";
    }
}
