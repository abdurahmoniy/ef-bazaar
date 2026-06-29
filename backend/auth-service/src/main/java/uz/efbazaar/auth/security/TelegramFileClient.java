package uz.efbazaar.auth.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

/**
 * Resolves a Telegram {@code file_id} to image bytes for the /me/photo proxy.
 *
 * <p>Telegram's getFile returns a {@code file_path} that's valid for at least an
 * hour. We cache it in Redis for 50 minutes so repeat fetches don't hit the
 * Bot API for every avatar load.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramFileClient {

    private static final String FILE_PATH_PREFIX = "tg:filepath:";
    private static final Duration FILE_PATH_TTL = Duration.ofMinutes(50);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    @Value("${app.telegram.bot-token:}")
    private String botToken;

    @Value("${app.telegram.api-base-url:https://api.telegram.org}")
    private String apiBaseUrl;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /** Returns image bytes for the given file_id, or empty on any failure. */
    public Optional<byte[]> fetchBytes(String fileId) {
        if (botToken == null || botToken.isBlank()) {
            log.warn("Telegram bot token not configured — cannot fetch file {}", fileId);
            return Optional.empty();
        }

        Optional<String> filePath = resolveFilePath(fileId);
        if (filePath.isEmpty()) return Optional.empty();

        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(apiBaseUrl + "/file/bot" + botToken + "/" + filePath.get()))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<byte[]> res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (res.statusCode() / 100 != 2) {
                log.warn("Telegram file download HTTP {} for path {}", res.statusCode(), filePath.get());
                // Stale cached path — drop and retry once on next call
                redis.delete(FILE_PATH_PREFIX + fileId);
                return Optional.empty();
            }
            return Optional.of(res.body());
        } catch (Exception e) {
            log.warn("Telegram file download failed for {}: {}", fileId, e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<String> resolveFilePath(String fileId) {
        String cached = redis.opsForValue().get(FILE_PATH_PREFIX + fileId);
        if (cached != null && !cached.isBlank()) return Optional.of(cached);

        try {
            String body = "{\"file_id\":\"" + fileId + "\"}";
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(apiBaseUrl + "/bot" + botToken + "/getFile"))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode root = objectMapper.readTree(res.body());
            if (!root.path("ok").asBoolean(false)) {
                log.warn("Telegram getFile returned error for {}: {}", fileId, root);
                return Optional.empty();
            }
            String path = root.path("result").path("file_path").asText(null);
            if (path == null) return Optional.empty();
            redis.opsForValue().set(FILE_PATH_PREFIX + fileId, path, FILE_PATH_TTL);
            return Optional.of(path);
        } catch (Exception e) {
            log.warn("Telegram getFile call failed for {}: {}", fileId, e.getMessage());
            return Optional.empty();
        }
    }
}
