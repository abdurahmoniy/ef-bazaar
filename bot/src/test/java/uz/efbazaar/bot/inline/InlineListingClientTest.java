package uz.efbazaar.bot.inline;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;
import reactor.core.publisher.Mono;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The search text is whatever the user typed; it must reach marketplace unchanged. */
class InlineListingClientTest {

    private final List<URI> urls = new ArrayList<>();

    private InlineListingClient client() {
        WebClient web = WebClient.builder().baseUrl("http://marketplace")
                .exchangeFunction(req -> {
                    urls.add(req.url());
                    return Mono.just(ClientResponse.create(HttpStatus.OK)
                            .header("Content-Type", "application/json")
                            .body("{\"linked\":true,\"items\":[],\"nextOffset\":null}").build());
                }).build();
        return new InlineListingClient(web, new BotSettingsProperties("http://marketplace", "s"));
    }

    private String sentQuery() {
        return UriComponentsBuilder.fromUri(urls.get(0)).build(true).getQueryParams().getFirst("q");
    }

    @Test
    void curlyBracesInTheQueryAreSentAsText() {
        assertThat(client().find(42L, "{messi}", 0)).isPresent();
        assertThat(java.net.URLDecoder.decode(sentQuery(), java.nio.charset.StandardCharsets.UTF_8)).isEqualTo("{messi}");
    }

    @Test
    void aPlusIsNotTurnedIntoASpace() {
        client().find(42L, "a+b", 0);
        assertThat(java.net.URLDecoder.decode(sentQuery(), java.nio.charset.StandardCharsets.UTF_8)).isEqualTo("a+b");
    }
}
