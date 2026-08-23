package uz.efbazaar.marketplace.cards.sync;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "app.cards.sync")
public record EfhubSyncProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("0 0 9 * * *") String cron,
        @DefaultValue("5000") long delayMs,
        @DefaultValue("50") int batchLimit,
        @DefaultValue("https://efhub.com") String baseUrl,
        @DefaultValue("https://efhub.com/search/player-index.json") String indexUrl,
        @DefaultValue("30") int requestTimeoutSeconds,
        @DefaultValue("3") int retries,
        @DefaultValue("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        String userAgent
) {}
