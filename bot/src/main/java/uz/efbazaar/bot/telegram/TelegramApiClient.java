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

    /** Matn + callback tugmalar — qo'llanmalar ro'yxati shu ko'rinishda chiqadi. */
    public Optional<Integer> sendMessageWithCallbacks(String chatId, String html,
                                                      List<List<CallbackButton>> keyboard) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("text", html)
                .put("parse_mode", "HTML");
        body.put("disable_web_page_preview", true);
        if (keyboard != null && !keyboard.isEmpty()) {
            body.set("reply_markup", buildCallbackKeyboard(keyboard));
        }
        return postJson("sendMessage", body).map(r -> r.path("message_id").asInt());
    }

    /**
     * Tugma bosilganini Telegram'ga tasdiqlaymiz.
     *
     * <p>Chaqirilmasa tugmada aylanuvchi belgi bir necha soniya osilib
     * turadi va foydalanuvchi bot javob bermayapti deb o'ylaydi.
     */
    public void answerCallbackQuery(String callbackQueryId) {
        postJson("answerCallbackQuery",
                objectMapper.createObjectNode().put("callback_query_id", callbackQueryId));
    }

    /**
     * sendVideo — o'ynatiladigan video sifatida yuklaydi.
     *
     * <p>{@link #sendDocument} dan farqi shu: document klientda FAYL bo'lib
     * ko'rinadi — bosib yuklab olish kerak. Video esa chat ichida o'ynaydi.
     *
     * <p>Telegram bot yuklagan videoni QAYTA KODLAMAYDI: ilovadagi siqish
     * faqat odam yuborganda ishlaydi. Hujjatga ko'ra klientlar MPEG4 ni
     * qo'llab-quvvatlaydi, boshqa formatlar Document sifatida yetkazilishi
     * mumkin — shuning uchun pastda `file_id` ikkala maydondan ham
     * o'qiladi.
     *
     * <p>{@code supports_streaming} — video to'liq yuklanmasdan o'ynay
     * boshlaydi. Uzun qo'llanmada bu kutish vaqtini yo'q qiladi.
     *
     * @return (messageId, video file_id) yoki bo'sh — yuklash yiqilgan.
     */
    public Optional<UploadedDocument> sendVideo(String chatId, Integer threadId,
                                                MediaFile file, String caption) {
        return sendVideo(chatId, threadId, asResource(file), caption);
    }

    /**
     * Video OQIM bilan yuboriladi — bayt massivi orqali emas.
     *
     * <p>Bu shunchaki nafislik emas. Bot heap'i {@code -Xmx160m}; 50 MB lik
     * videoni {@code getBytes()} bilan o'qish uni OOM ga olib boradi va
     * {@code -XX:+ExitOnOutOfMemoryError} bilan konteyner O'LADI. Spring
     * multipart faylni allaqachon diskka yozadi, shuning uchun uni
     * {@code Resource} sifatida uzatsak xotiraga umuman tushmaydi.
     */
    public Optional<UploadedDocument> sendVideo(String chatId, Integer threadId,
                                                Resource video, String caption) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("chat_id", chatId);
        if (threadId != null) form.add("message_thread_id", String.valueOf(threadId));
        if (caption != null && !caption.isBlank()) {
            form.add("caption", caption);
            form.add("parse_mode", "HTML");
        }
        form.add("supports_streaming", "true");
        form.add("video", video);

        try {
            JsonNode result = telegramWebClient.post()
                    .uri("/sendVideo")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(form))
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .map(r -> r.path("ok").asBoolean() ? r.path("result") : null)
                    .block();
            if (result == null) return Optional.empty();
            // Telegram ba'zan videoni `document` sifatida qaytaradi — masalan
            // kodek qo'llab-quvvatlanmasa. Ikkalasini ham qabul qilamiz:
            // file_id baribir ishlaydi va qo'llanma yo'qolmaydi.
            String fileId = result.path("video").path("file_id").asText(null);
            if (fileId == null) fileId = result.path("document").path("file_id").asText(null);
            if (fileId == null) return Optional.empty();
            return Optional.of(new UploadedDocument(result.path("message_id").asInt(), fileId));
        } catch (WebClientResponseException e) {
            log.error("sendVideo failed: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            return Optional.empty();
        }
    }

    /**
     * sendVideo file_id bo'yicha — fayl qayta yuklanmaydi.
     *
     * <p>Qo'llanma har bosilganda qayta yuborilishi kerak; faylni har safar
     * yuklash sekin ham, keraksiz ham. Telegram `file_id` ni qabul qiladi va
     * nusxani o'zi oladi.
     */
    public Optional<Integer> sendVideoByFileId(String chatId, String fileId, String caption,
                                               List<List<CallbackButton>> keyboard) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("video", fileId)
                .put("supports_streaming", true);
        if (caption != null && !caption.isBlank()) {
            body.put("caption", caption);
            body.put("parse_mode", "HTML");
        }
        if (keyboard != null && !keyboard.isEmpty()) {
            body.set("reply_markup", buildCallbackKeyboard(keyboard));
        }
        return postJson("sendVideo", body).map(r -> r.path("message_id").asInt());
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

    /**
     * Kanaldagi obunachilar soni.
     *
     * <p>Bot kanalda ADMIN bo'lishi shart — oddiy a'zo bu ma'lumotni
     * o'qiy olmaydi. Aynan shuning uchun hamkorlik oqimida botni admin
     * qilib qo'shish talab qilinadi.
     */
    public Optional<Integer> getChatMemberCount(long chatId) {
        ObjectNode body = objectMapper.createObjectNode().put("chat_id", chatId);
        return postJson("getChatMemberCount", body).map(JsonNode::asInt);
    }

    /**
     * Foydalanuvchining kanaldagi maqomi: {@code creator}, {@code administrator},
     * {@code member}, {@code left}, {@code kicked}.
     *
     * <p>Hamkorlik uchun faqat {@code creator} yetarli: administrator kanal
     * egasi emas va uni hamkor deb hisoblab bo'lmaydi.
     */
    public Optional<String> getChatMemberStatus(long chatId, long userId) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("user_id", userId);
        return postJson("getChatMember", body)
                .map(result -> result.path("status").asText(null));
    }

    /**
     * Kanal avatarining {@code file_id} si.
     *
     * <p>{@code getChat} SHART: {@code my_chat_member} yangilanishidagi
     * {@code chat} obyekti nom va username ni olib yuradi, rasmni esa
     * yo'q — u faqat to'liq chat ma'lumotida bo'ladi.
     *
     * <p>{@code big_file_id} olinadi: kartochka ro'yxatda kichik
     * ko'rinadi, lekin bir marta yuklab, keyin har o'lchamda
     * ishlatilishi mumkin.
     */
    public Optional<String> getChatPhotoFileId(long chatId) {
        return getChat(chatId)
                .map(result -> result.path("photo").path("big_file_id").asText(null));
    }

    /**
     * Kanalning to'liq {@code Chat} obyektini qaytaradi.
     *
     * <p>Kunlik yangilanish nom, username va avatarni BIRGA o'qiydi:
     * uchtasi uchun uch marta {@code getChat} chaqirish Telegram
     * cheklovini bekorga sarflardi.
     */
    /**
     * Xabarni boshqa kanalga FORWARD qiladi.
     *
     * <p>"Forwarded from &lt;manba&gt;" sarlavhasi saqlanadi, lekin
     * INLINE TUGMA yo'qoladi — Telegram uni forwardda olib tashlaydi.
     * Shuning uchun e'lon havolasi post matnining o'zida ham turadi.
     */
    public Optional<Integer> forwardMessage(String toChatId, String fromChatId, long messageId) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", toChatId)
                .put("from_chat_id", fromChatId)
                .put("message_id", messageId);
        return postJson("forwardMessage", body).map(r -> r.path("message_id").asInt());
    }

    /**
     * Chiqib bo'lgan postning matnini almashtiradi.
     *
     * <p>{@code reply_markup} YUBORILMAYDI va shu bilan tugma olib
     * tashlanadi: sotilgan e'lonning tugmasi bosilsa, odam mavjud
     * bo'lmagan taklifga borardi.
     *
     * <p>Rasmli post uchun {@code editMessageCaption}, matnli uchun
     * {@code editMessageText} — Telegram ularni almashtirib
     * ishlatishga ruxsat bermaydi, shuning uchun ikkalasi ham
     * sinaladi.
     */
    public boolean editPostText(String chatId, long messageId, String html) {
        ObjectNode caption = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("message_id", messageId)
                .put("caption", html)
                .put("parse_mode", "HTML");
        if (postJson("editMessageCaption", caption).isPresent()) return true;

        ObjectNode text = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("message_id", messageId)
                .put("text", html)
                .put("parse_mode", "HTML");
        text.putObject("link_preview_options").put("is_disabled", true);
        return postJson("editMessageText", text).isPresent();
    }

    public Optional<JsonNode> getChat(long chatId) {
        ObjectNode body = objectMapper.createObjectNode().put("chat_id", chatId);
        return postJson("getChat", body);
    }

    /**
     * Emoji to'plamini butunlay o'qiydi.
     *
     * <p>Nom `https://t.me/addemoji/<nom>` havolasining oxirgi bo'lagi.
     * Marketplace uni tekshirib yuboradi (EmojiPackLink), shuning uchun bu
     * yerda qayta tozalanmaydi.
     */
    public Optional<JsonNode> getStickerSet(String name) {
        ObjectNode body = objectMapper.createObjectNode().put("name", name);
        return postJson("getStickerSet", body);
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
        body.set("allowed_updates", allowedUpdates());
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
        body.set("allowed_updates", allowedUpdates());
        return postJson("getUpdates", body);
    }

    /**
     * Qaysi yangilanishlar kerakligi.
     *
     * <p>{@code my_chat_member} ni ATAYLAB sanab o'tamiz: Telegram standart
     * holatda uni YUBORMAYDI va ro'yxat berilmasa bot kanalga admin qilib
     * qo'shilganini umuman bilmay qolardi. Ro'yxat berilgach, unda
     * sanalmagan tur ham kelmaydi — shuning uchun `message` ham bu yerda.
     */
    private ArrayNode allowedUpdates() {
        return objectMapper.createArrayNode()
                .add("message")
                .add("callback_query")
                .add("my_chat_member");
    }

    /**
     * sendMessage with a multi-row inline keyboard. Same rules as the
     * single-button overload: {@code web_app} buttons are private-chat only.
     */
    public Optional<Integer> sendMessageWithKeyboard(String chatId, String text,
                                                     List<List<WebAppButton>> rows) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("text", text)
                .put("parse_mode", "HTML")
                .put("disable_web_page_preview", true);
        body.set("reply_markup", buildKeyboard(rows));
        return postJson("sendMessage", body).map(this::extractMessageId);
    }

    /**
     * sendPhoto by an already-uploaded {@code file_id}, with a caption and an
     * inline keyboard. Nothing is re-uploaded — Telegram already holds the
     * bytes, so this costs one API call regardless of image size.
     *
     * <p>Caption is capped at 1024 characters by Telegram (markup excluded).
     * Over that, the API rejects the whole message and nothing is sent.
     */
    public Optional<Integer> sendPhotoWithKeyboard(String chatId, String fileId, String caption,
                                                   List<List<WebAppButton>> rows) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("photo", fileId);
        if (caption != null && !caption.isBlank()) {
            body.put("caption", caption);
            body.put("parse_mode", "HTML");
        }
        body.set("reply_markup", buildKeyboard(rows));
        return postJson("sendPhoto", body).map(this::extractMessageId);
    }

    /**
     * Ommaviy xabar uchun yuborish — natijani AJRATIB qaytaradi.
     *
     * <p>Oddiy {@code sendMessage} xatolikni yutib {@code Optional.empty()}
     * beradi va bu yerda yetarli emas: bloklagan foydalanuvchi (403) kutilgan
     * holat va har jo'natishda uchraydi, tezlik chegarasi (429) esa kutish va
     * qayta urinishni talab qiladi, qolgan xatoliklar esa tekshirilishi kerak.
     * Uchalasini bitta "yuborilmadi" ga qo'shsak, nosozlik normal fonda
     * ko'rinmay qolardi.
     */
    public SendOutcome sendBroadcast(String chatId, String text, String bannerFileId,
                                     List<List<UrlButton>> keyboard) {
        boolean withBanner = bannerFileId != null && !bannerFileId.isBlank();
        ObjectNode body = objectMapper.createObjectNode().put("chat_id", chatId);

        if (withBanner) {
            body.put("photo", bannerFileId);
            if (text != null && !text.isBlank()) {
                body.put("caption", text);
                body.put("parse_mode", "HTML");
            }
        } else {
            body.put("text", text);
            body.put("parse_mode", "HTML");
            body.put("disable_web_page_preview", true);
        }
        if (keyboard != null && !keyboard.isEmpty()) {
            body.set("reply_markup", buildUrlKeyboard(keyboard));
        }

        try {
            telegramWebClient.post()
                    .uri(withBanner ? "/sendPhoto" : "/sendMessage")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();
            return SendOutcome.sent();
        } catch (WebClientResponseException e) {
            return classify(e);
        } catch (Exception e) {
            return SendOutcome.failed(e.getMessage());
        }
    }

    private SendOutcome classify(WebClientResponseException e) {
        int status = e.getStatusCode().value();
        String body = e.getResponseBodyAsString();

        if (status == 429) {
            // Telegram qancha kutish kerakligini o'zi aytadi. Taxmin qilish
            // o'rniga shuni o'qiymiz — kam kutsak yana chegaraga uriladi,
            // ko'p kutsak jo'natish keraksiz cho'ziladi.
            int retryAfter = 1;
            try {
                JsonNode parsed = objectMapper.readTree(body);
                retryAfter = parsed.path("parameters").path("retry_after").asInt(1);
            } catch (Exception ignored) {
                // Javob kutilmagan shaklda — bir soniya kutamiz.
            }
            return SendOutcome.rateLimited(retryAfter);
        }

        // 403 — bot bloklangan, foydalanuvchi o'chirilgan, yoki u hech qachon
        // /start bosmagan. Qayta urinish foyda bermaydi.
        // 400 "chat not found" ham xuddi shunday yakuniy holat.
        if (status == 403 || (status == 400 && body.contains("chat not found"))) {
            return SendOutcome.blocked();
        }
        return SendOutcome.failed(status + " " + body);
    }

    /**
     * Bitta oddiy havola tugmasi bilan xabar.
     *
     * <p>{@link #sendMessageWithKeyboard} dan farqi: u {@code web_app}
     * tugmalarini yasaydi va ular Mini App'ni ochadi. Bu yerda esa
     * Telegram'ning o'z chuqur havolasi kerak — u ilova ichida kanal
     * tanlash oynasini ochadi, saytni emas.
     */
    public Optional<Integer> sendMessageWithUrlButton(String chatId, String text,
                                                      UrlButton button) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("text", text)
                .put("parse_mode", "HTML")
                .put("disable_web_page_preview", true);
        body.set("reply_markup", buildUrlKeyboard(List.of(List.of(button))));
        return postJson("sendMessage", body).map(this::extractMessageId);
    }

    /**
     * sendPhoto (allaqachon yuklangan {@code file_id} bo'yicha) + bitta oddiy
     * havola tugmasi.
     *
     * <p>{@link #sendPhotoWithKeyboard} dan farqi tugma turida va bu farq
     * hal qiluvchi: u {@code web_app} tugmalarini yasaydi, ular esa FAQAT
     * shaxsiy chatda ishlaydi. Kanalga shunday tugma bilan yuborilgan
     * xabarni Telegram butunlay rad etadi, ya'ni rasm ham chiqmaydi.
     *
     * <p>Izoh Telegram tomonidan 1024 belgi bilan cheklangan — undan uzuni
     * yuborilsa butun xabar rad etiladi.
     */
    public Optional<Integer> sendPhotoWithUrlButton(String chatId, String fileId, String caption,
                                                    UrlButton button) {
        ObjectNode body = objectMapper.createObjectNode()
                .put("chat_id", chatId)
                .put("photo", fileId);
        if (caption != null && !caption.isBlank()) {
            body.put("caption", caption);
            body.put("parse_mode", "HTML");
        }
        body.set("reply_markup", buildUrlKeyboard(List.of(List.of(button))));
        return postJson("sendPhoto", body).map(this::extractMessageId);
    }

    /**
     * Bosilganda BOTGA qaytadigan tugma.
     *
     * <p>{@link UrlButton} dan farqi: u foydalanuvchini tashqariga olib
     * chiqadi, bu esa botga `callback_query` yuboradi va bot javob beradi.
     * Qo'llanma tugmalari aynan shunday — video botdan keladi.
     *
     * <p>{@code data} 64 BAYTDAN oshmasligi kerak — Telegram cheklovi.
     * Undan uzun bo'lsa tugma jimgina ishlamaydi.
     */
    public record CallbackButton(String text, String data) {}

    private ObjectNode buildCallbackKeyboard(List<List<CallbackButton>> rows) {
        ArrayNode keyboard = objectMapper.createArrayNode();
        for (List<CallbackButton> row : rows) {
            ArrayNode jsonRow = objectMapper.createArrayNode();
            for (CallbackButton button : row) {
                jsonRow.add(objectMapper.createObjectNode()
                        .put("text", button.text())
                        .put("callback_data", button.data()));
            }
            keyboard.add(jsonRow);
        }
        ObjectNode markup = objectMapper.createObjectNode();
        markup.set("inline_keyboard", keyboard);
        return markup;
    }

    private ObjectNode buildUrlKeyboard(List<List<UrlButton>> rows) {
        ArrayNode keyboard = objectMapper.createArrayNode();
        for (List<UrlButton> row : rows) {
            ArrayNode jsonRow = objectMapper.createArrayNode();
            for (UrlButton button : row) {
                jsonRow.add(objectMapper.createObjectNode()
                        .put("text", button.text())
                        .put("url", button.url()));
            }
            keyboard.add(jsonRow);
        }
        ObjectNode markup = objectMapper.createObjectNode();
        markup.set("inline_keyboard", keyboard);
        return markup;
    }

    private ObjectNode buildKeyboard(List<List<WebAppButton>> rows) {
        ArrayNode keyboard = objectMapper.createArrayNode();
        for (List<WebAppButton> row : rows) {
            ArrayNode jsonRow = objectMapper.createArrayNode();
            for (WebAppButton button : row) {
                ObjectNode webApp = objectMapper.createObjectNode().put("url", button.url());
                ObjectNode node = objectMapper.createObjectNode().put("text", button.text());
                node.set("web_app", webApp);
                jsonRow.add(node);
            }
            keyboard.add(jsonRow);
        }
        ObjectNode markup = objectMapper.createObjectNode();
        markup.set("inline_keyboard", keyboard);
        return markup;
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

    /**
     * Ordinary inline-keyboard button that opens a URL.
     *
     * <p>Separate from {@link WebAppButton} because the two are different
     * things to Telegram: a {@code web_app} button opens the Mini App inside
     * Telegram and only works in private chats, while a {@code url} button
     * hands the link to the browser. Broadcasts carry admin-supplied links
     * to arbitrary destinations, so they use this one.
     */
    public record UrlButton(String text, String url) {}

    /** Natijasi ajratilgan yuborish — {@link #sendBroadcast} uchun. */
    public record SendOutcome(Result result, int retryAfterSeconds, String error) {

        public enum Result { SENT, BLOCKED, RATE_LIMITED, FAILED }

        public static SendOutcome sent()                  { return new SendOutcome(Result.SENT, 0, null); }
        public static SendOutcome blocked()               { return new SendOutcome(Result.BLOCKED, 0, null); }
        public static SendOutcome rateLimited(int after)  { return new SendOutcome(Result.RATE_LIMITED, after, null); }
        public static SendOutcome failed(String error)    { return new SendOutcome(Result.FAILED, 0, error); }
    }

    /** Result of {@link #sendDocument}. */
    public record UploadedDocument(int messageId, String fileId) {}

    /** Source photo metadata used to dedupe before re-uploading. */
    public record ProfilePhoto(String fileId, String fileUniqueId) {}
}
