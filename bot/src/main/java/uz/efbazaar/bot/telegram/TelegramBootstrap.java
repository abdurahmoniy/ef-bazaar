package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.config.TelegramProperties;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Bot startup:
 *   - Webhook mode (URL env set): registers webhook.
 *   - Long-polling mode (no URL): clears webhook + polls every 2s.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramBootstrap {

    private final TelegramApiClient telegram;
    private final TelegramProperties props;
    private final UpdateHandler updateHandler;

    private final AtomicLong nextOffset = new AtomicLong(0);
    private volatile boolean longPolling = false;

    @PostConstruct
    void init() {
        if (props.botToken() == null || props.botToken().isBlank()) {
            log.warn("TELEGRAM_BOT_TOKEN not configured — bot is disabled");
            return;
        }
        if (props.isWebhookMode()) {
            log.info("Registering webhook at {}", props.webhookUrl());
            telegram.setWebhook(props.webhookUrl());
        } else {
            log.info("No webhook URL — clearing any existing webhook and using long-polling");
            telegram.setWebhook("");
            longPolling = true;
        }
    }

    @Scheduled(fixedDelayString = "${app.telegram.poll-interval-ms:2000}", initialDelay = 3000)
    void pollIfEnabled() {
        if (!longPolling) return;

        Optional<JsonNode> result = telegram.getUpdates(nextOffset.get(), 25);
        result.ifPresent(updates -> {
            if (!updates.isArray()) return;
            for (JsonNode update : updates) {
                long updateId = update.path("update_id").asLong();
                try {
                    updateHandler.handle(update);
                } catch (Exception e) {
                    log.error("Polling update {} failed", updateId, e);
                }
                nextOffset.updateAndGet(curr -> Math.max(curr, updateId + 1));
            }
        });
    }
}
