package uz.efbazaar.bot.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.reactive.ClientHttpRequest;
import org.springframework.mock.http.client.reactive.MockClientHttpRequest;
import org.springframework.web.reactive.function.BodyInserter;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import uz.efbazaar.bot.config.TelegramProperties;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TelegramApiClientInlineTest {

    private final ObjectMapper json = new ObjectMapper();
    private final List<String> bodies = new ArrayList<>();
    private final List<String> paths = new ArrayList<>();

    private TelegramApiClient client() {
        WebClient web = WebClient.builder()
                .exchangeFunction(request -> {
                    paths.add(request.url().getPath());
                    bodies.add(bodyOf(request));
                    return Mono.just(ClientResponse.create(HttpStatus.OK)
                            .header("Content-Type", "application/json")
                            .body("{\"ok\":true,\"result\":true}").build());
                })
                .build();
        var props = new TelegramProperties("token", "testbot", "http://tg.api", null,
                new TelegramProperties.Topics(1, 2, 3, 4, 5), null, null);
        return new TelegramApiClient(web, props);
    }

    @SuppressWarnings("unchecked")
    private static String bodyOf(ClientRequest request) {
        MockClientHttpRequest out = new MockClientHttpRequest(request.method(), URI.create("/"));
        ((BodyInserter<Object, ClientHttpRequest>) (BodyInserter<?, ?>) request.body())
                .insert(out, new BodyInserter.Context() {
                    public List<org.springframework.http.codec.HttpMessageWriter<?>> messageWriters() {
                        return ExchangeStrategies.withDefaults().messageWriters();
                    }
                    public java.util.Optional<org.springframework.http.server.reactive.ServerHttpRequest> serverRequest() {
                        return java.util.Optional.empty();
                    }
                    public java.util.Map<String, Object> hints() {
                        return java.util.Map.of();
                    }
                }).block();
        return out.getBodyAsString().block();
    }

    @Test
    void inlineQueryIsAmongAllowedUpdates() throws Exception {
        assertThat(TelegramApiClient.ALLOWED_UPDATES)
                .containsExactly("message", "callback_query", "my_chat_member", "inline_query");

        TelegramApiClient c = client();
        c.getUpdates(0, 1);
        c.setWebhook("https://x", "s");
        for (String body : bodies) {
            assertThat(json.readTree(body).path("allowed_updates").toString()).contains("inline_query");
        }
    }

    @Test
    void answerInlineQuerySendsPersonalCachedResultsWithOffsetAndButton() throws Exception {
        ArrayNode results = json.createArrayNode().add(json.createObjectNode().put("type", "article").put("id", "1"));
        ObjectNode button = json.createObjectNode().put("text", "Bog'lash");
        button.putObject("web_app").put("url", "https://efbazaar.uz/profile");

        client().answerInlineQuery("Q1", results, 10, true, "20", button);

        assertThat(paths).containsExactly("/answerInlineQuery");
        JsonNode body = json.readTree(bodies.get(0));
        assertThat(body.path("inline_query_id").asText()).isEqualTo("Q1");
        assertThat(body.path("results").size()).isEqualTo(1);
        assertThat(body.path("cache_time").asInt()).isEqualTo(10);
        assertThat(body.path("is_personal").asBoolean()).isTrue();
        assertThat(body.path("next_offset").asText()).isEqualTo("20");
        assertThat(body.path("button").path("web_app").path("url").asText()).isEqualTo("https://efbazaar.uz/profile");
    }

    @Test
    void answerInlineQueryOmitsNullOffsetAndButton() throws Exception {
        client().answerInlineQuery("Q2", json.createArrayNode(), 0, true, null, null);

        JsonNode body = json.readTree(bodies.get(0));
        assertThat(body.has("next_offset")).isFalse();
        assertThat(body.has("button")).isFalse();
        assertThat(body.path("cache_time").asInt()).isEqualTo(0);
    }
}
