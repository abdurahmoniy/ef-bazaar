package uz.efbazaar.bot.controller;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.bot.telegram.UpdateHandler;

import java.time.Instant;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/bot")
@RequiredArgsConstructor
public class WebhookController {

    private final UpdateHandler updateHandler;

    @PostMapping("/webhook")
    public ResponseEntity<Void> webhook(@RequestBody JsonNode update) {
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
