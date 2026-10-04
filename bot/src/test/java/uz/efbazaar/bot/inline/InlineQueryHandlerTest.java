package uz.efbazaar.bot.inline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InlineQueryHandlerTest {

    final ObjectMapper json = new ObjectMapper();
    final InlineListingClient client = mock(InlineListingClient.class);
    final TelegramApiClient telegram = mock(TelegramApiClient.class);
    final InlineQueryHandler handler = new InlineQueryHandler(client, telegram, "https://efbazaar.uz/");

    final ArgumentCaptor<ArrayNode> results = ArgumentCaptor.forClass(ArrayNode.class);
    final ArgumentCaptor<ObjectNode> button = ArgumentCaptor.forClass(ObjectNode.class);
    final ArgumentCaptor<Integer> cache = ArgumentCaptor.forClass(Integer.class);
    final ArgumentCaptor<String> next = ArgumentCaptor.forClass(String.class);

    {
        when(telegram.answerInlineQuery(anyString(), any(ArrayNode.class), anyInt(),
                org.mockito.ArgumentMatchers.anyBoolean(), any(), any())).thenReturn(true);
    }

    JsonNode query(String q, String offset) {
        ObjectNode n = json.createObjectNode().put("id", "Q1").put("query", q).put("offset", offset);
        n.putObject("from").put("id", 42L);
        return n;
    }

    static InlineListingClient.Item item(String cover, String caption) {
        return new InlineListingClient.Item("7f0d2b8e-0000-4000-8000-000000000001",
                "2 500 000 so'm · Division 1", "iOS 1200 · Android 800\nMessi", caption, cover,
                "https://t.me/EfBazaarBot/app?startapp=7f0d");
    }

    void answered() {
        verify(telegram).answerInlineQuery(eq("Q1"), results.capture(), cache.capture(), eq(true),
                next.capture(), button.capture());
    }

    @Test
    void anItemBecomesAnArticleWithLargeCoverPreviewAndMiniAppButton() {
        when(client.find(42L, "", 0)).thenReturn(Optional.of(new InlineListingClient.InlinePage(
                true, List.of(item("FILE_COVER", "<b>Division 1</b>")), 20)));

        handler.handle(query("", ""));

        answered();
        JsonNode r = results.getValue().get(0);
        assertThat(r.path("type").asText()).isEqualTo("article");
        assertThat(r.path("id").asText()).isEqualTo("7f0d2b8e-0000-4000-8000-000000000001");
        assertThat(r.path("title").asText()).isEqualTo("2 500 000 so'm · Division 1");
        assertThat(r.path("description").asText()).isEqualTo("iOS 1200 · Android 800\nMessi");
        assertThat(r.path("thumbnail_url").asText()).isEqualTo("https://efbazaar.uz/bot/photo/FILE_COVER");
        JsonNode content = r.path("input_message_content");
        assertThat(content.path("message_text").asText()).isEqualTo("<b>Division 1</b>");
        assertThat(content.path("parse_mode").asText()).isEqualTo("HTML");
        JsonNode preview = content.path("link_preview_options");
        assertThat(preview.path("url").asText()).isEqualTo("https://efbazaar.uz/bot/photo/FILE_COVER");
        assertThat(preview.path("prefer_large_media").asBoolean()).isTrue();
        assertThat(preview.path("show_above_text").asBoolean()).isTrue();
        JsonNode btn = r.path("reply_markup").path("inline_keyboard").get(0).get(0);
        assertThat(btn.path("text").asText()).isEqualTo("🛒 E'lonni ochish");
        assertThat(btn.path("url").asText()).isEqualTo("https://t.me/EfBazaarBot/app?startapp=7f0d");
        assertThat(cache.getValue()).isEqualTo(10);
        assertThat(next.getValue()).isEqualTo("20");
        assertThat(button.getValue()).isNull();
    }

    @Test
    void withoutACoverThereIsNoThumbnailAndThePreviewIsOff() {
        when(client.find(42L, "", 0)).thenReturn(Optional.of(new InlineListingClient.InlinePage(
                true, List.of(item(null, "x")), null)));

        handler.handle(query("", ""));

        answered();
        JsonNode r = results.getValue().get(0);
        assertThat(r.has("thumbnail_url")).isFalse();
        assertThat(r.path("input_message_content").path("link_preview_options").path("is_disabled").asBoolean()).isTrue();
        assertThat(next.getValue()).isNull();
    }

    @Test
    void anOverlongTextIsCutToTelegramsLimit() {
        when(client.find(42L, "", 0)).thenReturn(Optional.of(new InlineListingClient.InlinePage(
                true, List.of(item("F", "a".repeat(5000))), null)));

        handler.handle(query("", ""));

        answered();
        assertThat(results.getValue().get(0).path("input_message_content").path("message_text").asText().length())
                .isLessThanOrEqualTo(4096);
    }

    @Test
    void anUnlinkedUserIsOfferedToLinkTelegram() {
        when(client.find(42L, "", 0)).thenReturn(Optional.of(new InlineListingClient.InlinePage(false, List.of(), null)));

        handler.handle(query("", ""));

        answered();
        assertThat(results.getValue()).isEmpty();
        assertThat(button.getValue().path("text").asText()).isEqualTo("Telegram'ni efBazaar'ga bog'lash");
        assertThat(button.getValue().path("web_app").path("url").asText()).isEqualTo("https://efbazaar.uz/profile");
        assertThat(cache.getValue()).isEqualTo(10);
    }

    @Test
    void aLinkedUserWithNoListingsIsOfferedToPostOne() {
        when(client.find(42L, "", 0)).thenReturn(Optional.of(new InlineListingClient.InlinePage(true, List.of(), null)));

        handler.handle(query("", ""));

        answered();
        assertThat(button.getValue().path("text").asText()).isEqualTo("E'lon joylash");
        assertThat(button.getValue().path("web_app").path("url").asText()).isEqualTo("https://efbazaar.uz/marketplace/new");
    }

    @Test
    void anEmptySearchResultSaysNothingWasFound() {
        when(client.find(42L, "xyz", 0)).thenReturn(Optional.of(new InlineListingClient.InlinePage(true, List.of(), null)));

        handler.handle(query("xyz", ""));

        answered();
        assertThat(results.getValue()).isEmpty();
        assertThat(button.getValue().path("text").asText()).isEqualTo("Mos e'lon topilmadi");
        assertThat(button.getValue().path("web_app").path("url").asText()).isEqualTo("https://efbazaar.uz/marketplace");
        assertThat(cache.getValue()).isEqualTo(10);
    }

    @Test
    void aLaterEmptyPageOfASearchHasNoButton() {
        when(client.find(42L, "messi", 20)).thenReturn(Optional.of(new InlineListingClient.InlinePage(true, List.of(), null)));

        handler.handle(query("messi", "20"));

        answered();
        assertThat(button.getValue()).isNull();
    }

    @Test
    void whenMarketplaceFailsTheQueryIsStillAnsweredUncached() {
        when(client.find(42L, "", 0)).thenReturn(Optional.empty());

        handler.handle(query("", ""));

        answered();
        assertThat(results.getValue()).isEmpty();
        assertThat(button.getValue().path("text").asText()).isEqualTo("Hozir e'lonlarni olib bo'lmadi — qayta urinib ko'ring");
        assertThat(button.getValue().path("web_app").path("url").asText()).isEqualTo("https://efbazaar.uz/marketplace");
        assertThat(cache.getValue()).isEqualTo(0);
    }

    @Test
    void whenTelegramRejectsTheAnswerAFallbackAnswerIsSent() {
        when(client.find(42L, "", 0)).thenReturn(Optional.of(new InlineListingClient.InlinePage(
                true, List.of(item("F", "<a href=")), null)));
        when(telegram.answerInlineQuery(eq("Q1"), any(ArrayNode.class), eq(10), eq(true), any(), any()))
                .thenReturn(false);

        handler.handle(query("", ""));

        verify(telegram).answerInlineQuery(eq("Q1"), any(ArrayNode.class), eq(0), eq(true), isNull(),
                org.mockito.ArgumentMatchers.argThat(b -> b != null
                        && b.path("text").asText().startsWith("Hozir e'lonlarni olib bo'lmadi")));
    }

    @Test
    void theNextPageOffsetIsPassedThrough() {
        when(client.find(42L, "", 20)).thenReturn(Optional.of(new InlineListingClient.InlinePage(true, List.of(), null)));

        handler.handle(query("", "20"));

        verify(client).find(42L, "", 20);
    }

    @Test
    void aMalformedQueryIsAnsweredWithoutThrowing() {
        ObjectNode broken = json.createObjectNode().put("id", "Q1").put("offset", "abc");
        when(client.find(anyLong(), anyString(), anyInt())).thenReturn(Optional.empty());

        handler.handle(broken);

        verify(telegram).answerInlineQuery(eq("Q1"), any(ArrayNode.class), eq(0), eq(true), isNull(), any());
    }
}
