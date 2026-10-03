package uz.efbazaar.bot.inline;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

/**
 * marketplace's inline listings endpoint. Empty on any failure: an inline
 * query must be answered within seconds or Telegram shows the user nothing.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InlineListingClient {

    static final Duration TIMEOUT = Duration.ofMillis(1500);

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Item(String listingId, String title, String description,
                       String captionHtml, String coverFileId, String buttonUrl) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record InlinePage(boolean linked, List<Item> items, Integer nextOffset) {}

    public Optional<InlinePage> find(long telegramId, String q, int offset) {
        if (props.secret() == null || props.secret().isBlank()) return Optional.empty();
        try {
            return Optional.ofNullable(marketplaceWebClient.get()
                    .uri(u -> u.path("/internal/marketplace/v1/inline/listings")
                            .queryParam("telegramId", telegramId)
                            .queryParam("q", q)
                            .queryParam("offset", offset)
                            .build())
                    .header("X-Internal-Secret", props.secret())
                    .retrieve()
                    .bodyToMono(InlinePage.class)
                    .timeout(TIMEOUT)
                    .block());
        } catch (Exception e) {
            log.warn("Inline e'lonlarni olib bo'lmadi: {}", e.getMessage());
            return Optional.empty();
        }
    }
}
