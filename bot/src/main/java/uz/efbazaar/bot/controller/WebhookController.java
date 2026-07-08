package uz.efbazaar.bot.controller;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.UpdateHandler;

import java.time.Instant;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/bot")
@RequiredArgsConstructor
public class WebhookController {

    private final UpdateHandler updateHandler;
    private final TelegramProperties props;

    @PostMapping("/webhook")
    public ResponseEntity<Void> webhook(
            @RequestBody JsonNode update,
            @RequestHeader(name = "X-Telegram-Bot-Api-Secret-Token", required = false) String secret) {
        String expected = props.webhookSecret();
        if (expected != null && !expected.isBlank() && !expected.equals(secret)) {
            // No log body — random POSTs from the internet shouldn't fill up the log.
            log.warn("Rejected /bot/webhook: secret token mismatch");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        log.debug("Webhook update: {}", update);
        try {
            updateHandler.handle(update);
        } catch (Exception e) {
            log.error("Webhook handler failed", e);
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "service", "bot",
                "status", "UP",
                "timestamp", Instant.now().toString()
        );
    }
}
