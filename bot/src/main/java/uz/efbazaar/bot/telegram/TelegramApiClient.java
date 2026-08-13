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
        return sendMessage(chatId, threadId, text, null);
    }

    /**
     * sendMessage with an optional single-button inline keyboard that opens a
     * Telegram Mini App ({@code web_app} button). Only valid in private chats —
     * exactly where our DM notifications go. Pass {@code null} button to send a
     * plain message.
     */
    public Optional<Integer> sendMessage(String chatId, Integer threadId, String text,
                                         WebAppButton button) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("text", text)
                .put("parse_mode", "HTML")
                .put("disable_web_page_preview", true);
        if (threadId != null) {
            body.put("message_thread_id", threadId);
        }
        if (button != null) {
            ObjectNode webApp = objectMapper.createObjectNode()
                    .put("url", button.url());
            ObjectNode inlineButton = objectMapper.createObjectNode()
                    .put("text", button.text());
            inlineButton.set("web_app", webApp);
            ArrayNode row = objectMapper.createArrayNode().add(inlineButton);
            ObjectNode markup = objectMapper.createObjectNode();
            markup.set("inline_keyboard", objectMapper.createArrayNode().add(row));
            body.set("reply_markup", markup);
        }
        return postJson("sendMessage", body)
                .map(this::extractMessageId);
    }

    /**
     * deleteMessage — removes a message the bot itself sent.
     *
     * <p>Telegram answers {@code ok:false} when the message is already gone or
     * older than 48 hours. That is not an error worth propagating: the caller
     * only wants the message absent, and it is.
     *
     * @return true when Telegram confirmed the deletion.
     */
    public boolean deleteMessage(String chatId, long messageId) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("message_id", messageId);
        return postJson("deleteMessage", body).isPresent();
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
            // Telegram wraps every response in `{ok, result}`. Peel that off
            // before extractPhotos, which expects the raw message array.
            // Without this the upload succeeds (photos land in the media topic)
            // but bot returns an empty list → 502 back to marketplace-service.
            JsonNode result = telegramWebClient.post()
                    .uri("/sendMediaGroup")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(form))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .map(r -> r.path("ok").asBoolean() ? r.path("result") : null)
                    .block();
            if (result == null) {
                log.warn("Telegram sendMediaGroup returned ok=false");
                return List.of();
            }
            return extractPhotos(result);
        } catch (WebClientResponseException e) {
            log.error("Telegram sendMediaGroup failed: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            return List.of();
        }
    }

    /**
     * sendDocument — arbitrary file to the media topic, original bytes kept
     * (photos sent as documents are NOT recompressed by Telegram). Used for
     * chat file attachments.
     *
     * @return (messageId, document file_id) or empty on failure.
     */
    public Optional<UploadedDocument> sendDocument(String chatId, Integer threadId,
                                                   MediaFile file, String caption) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("chat_id", chatId);
        if (threadId != null) form.add("message_thread_id", String.valueOf(threadId));
        if (caption != null && !caption.isBlank()) {
            form.add("caption", caption);
            form.add("parse_mode", "HTML");
        }
        form.add("document", asResource(file));

        try {
            JsonNode result = telegramWebClient.post()
                    .uri("/sendDocument")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(form))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .map(r -> r.path("ok").asBoolean() ? r.path("result") : null)
                    .block();
            if (result == null) return Optional.empty();
            String fileId = result.path("document").path("file_id").asText(null);
            if (fileId == null) return Optional.empty();
            return Optional.of(new UploadedDocument(result.path("message_id").asInt(), fileId));
        } catch (WebClientResponseException e) {
            log.error("sendDocument failed: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            return Optional.empty();
        }
    }

    /**
     * getUserProfilePhotos — user'ning profile rasmlari ro'yxati.
     * Bizga eng birinchi rasm'ning eng katta o'lchami kerak.
     *
     * @return uploaded photo's {file_id, file_unique_id}, or empty if user has no public photo.
     */
    public Optional<ProfilePhoto> getUserProfilePhoto(long userId) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("user_id", userId)
                .put("limit", 1);
        return postJson("getUserProfilePhotos", body)
                .flatMap(result -> {
                    JsonNode photos = result.path("photos");
                    if (!photos.isArray() || photos.isEmpty()) return Optional.empty();
                    JsonNode sizes = photos.get(0);
                    if (!sizes.isArray() || sizes.isEmpty()) return Optional.empty();
                    JsonNode largest = sizes.get(sizes.size() - 1);
                    String fileId = largest.path("file_id").asText(null);
                    String fileUniqueId = largest.path("file_unique_id").asText(null);
                    if (fileId == null) return Optional.empty();
                    return Optional.of(new ProfilePhoto(fileId, fileUniqueId));
                });
    }

    /**
     * sendPhoto with an already-uploaded file_id (no re-upload, instant).
     * Used to forward profile photos into the media topic for audit/storage.
     */
    public Optional<UploadedPhoto> sendPhotoByFileId(String chatId, Integer threadId,
                                                     String fileId, String caption) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("photo", fileId);
        if (threadId != null) body.put("message_thread_id", threadId);
        if (caption != null && !caption.isBlank()) {
            body.put("caption", caption);
            body.put("parse_mode", "HTML");
        }
        return postJson("sendPhoto", body).flatMap(this::extractOnePhoto);
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

    /**
     * Webhook'ni o'rnatadi. Bo'sh URL webhook'ni o'chiradi (secret ham ignore'lanadi).
     * {@code secret} bo'sh emas bo'lsa Telegram har POST'da uni
     * {@code X-Telegram-Bot-Api-Secret-Token} header'ida qaytaradi — controller
     * shu bilan real Telegram va soxta chaqiruvni ajratadi.
     */
    public void setWebhook(String url, String secret) {
        ObjectNode body = objectMapper.createObjectNode().put("url", url == null ? "" : url);
        if (secret != null && !secret.isBlank()) {
            body.put("secret_token", secret);
        }
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
        String fileUniqueId = largest.path("file_unique_id").asText(null);
        return Optional.of(new UploadedPhoto(messageId, fileId, fileUniqueId));
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
    public record UploadedPhoto(int messageId, String fileId, String fileUniqueId) {}

    /** Single inline-keyboard button that opens a Telegram Mini App. */
    public record WebAppButton(String text, String url) {}

    /** Result of {@link #sendDocument}. */
    public record UploadedDocument(int messageId, String fileId) {}

    /** Source photo metadata used to dedupe before re-uploading. */
    public record ProfilePhoto(String fileId, String fileUniqueId) {}
}
