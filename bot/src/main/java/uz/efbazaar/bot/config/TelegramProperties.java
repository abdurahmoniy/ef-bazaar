package uz.efbazaar.bot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.telegram")
public record TelegramProperties(
        String botToken,
        String botUsername,
        String apiBaseUrl,
        String groupChatId,
        Topics topics,
        String webhookUrl,
        String webhookSecret
) {
    /**
     * Forum thread ids inside {@link #groupChatId()}.
     *
     * <p>{@code payments} has no default on purpose — an unset id must mean
     * "do not post", never "post into thread 2". These ids are secrets: they
     * come from the environment and are never logged.
     */
    public record Topics(
            Integer logs,
            Integer registration,
            Integer media,
            Integer payments,
            Integer support
    ) {
        public Topics(Integer logs, Integer registration, Integer media, Integer payments) {
            this(logs, registration, media, payments, null);
        }
    }

    public boolean isWebhookMode() {
        return webhookUrl != null && !webhookUrl.isBlank();
    }
}
