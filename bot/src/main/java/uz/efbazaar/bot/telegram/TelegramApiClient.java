package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;
import uz.efbazaar.bot.config.TelegramProperties;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Thin wrapper around the subset of Telegram Bot API we need.
 * Uses reactive {@link WebClient} but exposes blocking methods for callers
 * that run on servlet threads (Kafka listeners, controllers).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramApiClient {

    private final WebClient telegramWebClient;
    private final TelegramProperties props;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * sendMessage — supports HTML parse mode + optional topic (message_thread_id).
     * @return sent message id (or empty on failure — we don't crash the caller).
     */
    public Optional<Integer> sendMessage(String chatId, Integer threadId, String text) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("text", text)
                .put("parse_mode", "HTML")
                .put("disable_web_page_preview", true);
        if (threadId != null) {
            body.put("message_thread_id", threadId);
        }
        return postJson("sendMessage", body)
                .map(this::extractMessageId);
    }

    /**
     * sendMediaGroup — albom (2-10 rasm) sifatida yuboradi.
     * 1 ta rasm uchun sendPhoto ishlatamiz.
     * @return list of (messageId, fileId) for each photo
     */
    public List<UploadedPhoto> sendMediaGroup(String chatId, Integer threadId,
                                              List<MediaFile> files, String caption) {
        if (files.isEmpty()) return List.of();
        if (files.size() == 1) {
            return sendSinglePhoto(chatId, threadId, files.get(0), caption)
                    .map(List::of).orElse(List.of());
        }

        // sendMediaGroup multipart: media field (JSON), attach<i> fields (files)
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("chat_id", chatId);
        if (threadId != null) {
            form.add("message_thread_id", String.valueOf(threadId));
        }

        ArrayNode mediaArray = objectMapper.createArrayNode();
        for (int i = 0; i < files.size(); i++) {
            MediaFile f = files.get(i);
            String attachName = "photo" + i;

            ObjectNode mediaItem = objectMapper.createObjectNode();
            mediaItem.put("type", "photo");
            mediaItem.put("media", "attach://" + attachName);
            if (i == 0 && caption != null && !caption.isBlank()) {
                mediaItem.put("caption", caption);
                mediaItem.put("parse_mode", "HTML");
            }
            mediaArray.add(mediaItem);

            form.add(attachName, asResource(f));
        }
        form.add("media", mediaArray.toString());

        try {
            JsonNode response = telegramWebClient.post()
                    .uri("/sendMediaGroup")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(form))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();
            return extractPhotos(response);
        } catch (WebClientResponseException e) {
            log.error("Telegram sendMediaGroup failed: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            return List.of();
        }
    }

    /** Returns a downloadable file path for a given file_id (call getFile then prepend api URL). */
    public Optional<String> getFilePath(String fileId) {
        ObjectNode body = objectMapper.createObjectNode().put("file_id", fileId);
        return postJson("getFile", body)
                .map(result -> result.path("file_path").asText(null));
    }

    /**
     * Downloads file bytes from Telegram (after getFile).
     * URL: https://api.telegram.org/file/bot<token>/<file_path>
     */
    public Optional<byte[]> downloadFile(String filePath) {
        try {
            String url = props.apiBaseUrl() + "/file/bot" + props.botToken() + "/" + filePath;
            byte[] bytes = telegramWebClient.mutate()
                    .baseUrl(url)
                    .build()
                    .get()
                    .uri("")
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();
            return Optional.ofNullable(bytes);
        } catch (Exception e) {
            log.error("Failed to download file {}: {}", filePath, e.getMessage());
            return Optional.empty();
        }
    }

    /** Webhook ni o'rnatadi. Bo'sh URL bersangiz, webhook o'chiriladi. */
    public void setWebhook(String url) {
        ObjectNode body = objectMapper.createObjectNode().put("url", url == null ? "" : url);
        postJson("setWebhook", body)
                .ifPresentOrElse(
                        r -> log.info("Webhook set to '{}'", url),
                        () -> log.warn("setWebhook returned no result"));
    }

    /** Long-polling: getUpdates with offset. */
    public Optional<JsonNode> getUpdates(long offset, int timeoutSeconds) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("offset", offset)
                .put("timeout", timeoutSeconds);
        return postJson("getUpdates", body);
    }

    // ----- internal -----

    private Optional<JsonNode> postJson(String method, JsonNode body) {
        try {
            JsonNode response = telegramWebClient.post()
                    .uri("/" + method)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();
            if (response == null) return Optional.empty();
            if (!response.path("ok").asBoolean(false)) {
                log.warn("Telegram {} returned error: {}", method, response);
                return Optional.empty();
            }
            return Optional.of(response.path("result"));
        } catch (WebClientResponseException e) {
            log.error("Telegram {} HTTP {}: {}", method, e.getStatusCode(), e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Telegram {} failed: {}", method, e.getMessage());
        }
        return Optional.empty();
    }

    private Optional<UploadedPhoto> sendSinglePhoto(String chatId, Integer threadId,
                                                    MediaFile file, String caption) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("chat_id", chatId);
        if (threadId != null) form.add("message_thread_id", String.valueOf(threadId));
        if (caption != null && !caption.isBlank()) {
            form.add("caption", caption);
            form.add("parse_mode", "HTML");
        }
        form.add("photo", asResource(file));

        try {
            JsonNode result = telegramWebClient.post()
                    .uri("/sendPhoto")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(form))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .map(r -> r.path("ok").asBoolean() ? r.path("result") : null)
                    .block();
            if (result == null) return Optional.empty();
            return extractPhotos(result.isArray() ? result : objectMapper.createArrayNode().add(result))
                    .stream().findFirst();
        } catch (WebClientResponseException e) {
            log.error("sendPhoto failed: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            return Optional.empty();
        }
    }

    private List<UploadedPhoto> extractPhotos(JsonNode result) {
        List<UploadedPhoto> out = new ArrayList<>();
        if (result == null) return out;
        if (result.isArray()) {
            for (JsonNode msg : result) {
                extractOnePhoto(msg).ifPresent(out::add);
            }
        } else {
            extractOnePhoto(result).ifPresent(out::add);
        }
        return out;
    }

    private Optional<UploadedPhoto> extractOnePhoto(JsonNode msg) {
        if (msg == null || msg.isMissingNode()) return Optional.empty();
        int messageId = msg.path("message_id").asInt();
        JsonNode photos = msg.path("photo");
        if (!photos.isArray() || photos.isEmpty()) return Optional.empty();
        // Eng katta o'lcham (oxirgi element)
        JsonNode largest = photos.get(photos.size() - 1);
        String fileId = largest.path("file_id").asText();
        return Optional.of(new UploadedPhoto(messageId, fileId));
    }

    private Integer extractMessageId(JsonNode result) {
        return result == null ? null : result.path("message_id").asInt();
    }

    private Resource asResource(MediaFile f) {
        return new ByteArrayResource(f.bytes()) {
            @Override public String getFilename() { return f.filename(); }
            @Override public long contentLength() { return f.bytes().length; }
        };
    }

    public record MediaFile(byte[] bytes, String filename, String contentType) {}
    public record UploadedPhoto(int messageId, String fileId) {}
}
