package uz.efbazaar.bot.inline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.List;
import java.util.Optional;

/**
 * `@EfBazaarBot` inline mode: a user types the bot's name in any chat and
 * shares one of their own active listings as the official channel's post.
 *
 * <p>Results are articles, not photos: only articles show a thumbnail AND
 * text in Telegram's picker. The cover is then shown above the text as a
 * large link preview, so the sent message looks like the channel's photo post.
 * Identity is the {@code from.id} Telegram attached; the query only filters.
 */
@Slf4j
@Component
public class InlineQueryHandler {

    static final int CACHE_SECONDS = 10;
    static final int MAX_TEXT = 4096;
    static final String OPEN_BUTTON = "🛒 E'lonni ochish";
    static final String LINK_TEXT = "Telegram'ni efBazaar'ga bog'lash";
    static final String POST_TEXT = "E'lon joylash";
    static final String RETRY_TEXT = "Hozir e'lonlarni olib bo'lmadi — qayta urinib ko'ring";

    private final InlineListingClient client;
    private final TelegramApiClient telegram;
    private final String webBaseUrl;
    private final ObjectMapper json = new ObjectMapper();

    public InlineQueryHandler(InlineListingClient client, TelegramApiClient telegram,
                              @Value("${app.web.base-url:https://efbazaar.uz}") String webBaseUrl) {
        this.client = client;
        this.telegram = telegram;
        this.webBaseUrl = webBaseUrl == null ? "" : webBaseUrl.replaceAll("/+$", "");
    }

    public void handle(JsonNode inlineQuery) {
        String id = inlineQuery.path("id").asText();
        try {
            long telegramId = inlineQuery.path("from").path("id").asLong(0);
            String q = inlineQuery.path("query").asText("").trim();
            int offset = parseOffset(inlineQuery.path("offset").asText(""));
            Optional<InlineListingClient.InlinePage> page =
                    telegramId == 0 ? Optional.empty() : client.find(telegramId, q, offset);
            if (page.isEmpty()) {
                answerFailure(id);
                return;
            }
            answer(id, page.get(), q, offset);
        } catch (Exception e) {
            log.warn("Inline so'rovga javob yasab bo'lmadi: {}", e.getMessage());
            answerFailure(id);
        }
    }

    private void answer(String id, InlineListingClient.InlinePage page, String q, int offset) {
        List<InlineListingClient.Item> items = page.items() == null ? List.of() : page.items();
        ArrayNode results = json.createArrayNode();
        items.forEach(item -> results.add(article(item)));

        ObjectNode button = null;
        if (!page.linked()) {
            button = webAppButton(LINK_TEXT, "/profile");
        } else if (items.isEmpty() && q.isEmpty() && offset == 0) {
            button = webAppButton(POST_TEXT, "/marketplace/new");
        }
        String next = page.nextOffset() == null ? null : String.valueOf(page.nextOffset());
        if (!telegram.answerInlineQuery(id, results, CACHE_SECONDS, true, next, button)) {
            // One result with HTML Telegram cannot parse makes it reject the whole
            // answer; the user would see an empty picker with no explanation.
            log.warn("answerInlineQuery rad etildi ({} natija) — zaxira javob yuborilmoqda", results.size());
            answerFailure(id);
        }
    }

    private void answerFailure(String id) {
        telegram.answerInlineQuery(id, json.createArrayNode(), 0, true, null,
                webAppButton(RETRY_TEXT, "/marketplace"));
    }

    private ObjectNode article(InlineListingClient.Item item) {
        ObjectNode r = json.createObjectNode()
                .put("type", "article")
                .put("id", item.listingId())
                .put("title", item.title())
                .put("description", item.description());
        String cover = item.coverFileId() == null ? null : webBaseUrl + "/bot/photo/" + item.coverFileId();
        if (cover != null) r.put("thumbnail_url", cover);

        ObjectNode content = r.putObject("input_message_content")
                .put("message_text", truncate(item.captionHtml()))
                .put("parse_mode", "HTML");
        ObjectNode preview = content.putObject("link_preview_options");
        if (cover != null) {
            preview.put("url", cover).put("prefer_large_media", true).put("show_above_text", true);
        } else {
            preview.put("is_disabled", true);
        }

        ArrayNode row = r.putObject("reply_markup").putArray("inline_keyboard").addArray();
        row.addObject().put("text", OPEN_BUTTON).put("url", item.buttonUrl());
        return r;
    }

    private ObjectNode webAppButton(String text, String path) {
        ObjectNode b = json.createObjectNode().put("text", text);
        b.putObject("web_app").put("url", webBaseUrl + path);
        return b;
    }

    private static String truncate(String text) {
        if (text == null) return "";
        return text.length() <= MAX_TEXT ? text : text.substring(0, MAX_TEXT - 1) + "…";
    }

    private static int parseOffset(String raw) {
        try {
            return raw.isBlank() ? 0 : Math.max(0, Integer.parseInt(raw));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
