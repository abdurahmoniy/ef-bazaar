package uz.efbazaar.bot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.telegram")
public record TelegramProperties(
        String botToken,
        String botUsername,
        String apiBaseUrl,
        String groupChatId,
        Topics topics,
        String webhookUrl
) {
    public record Topics(
            Integer logs,
            Integer registration,
            Integer media
    ) {}

    public boolean isWebhookMode() {
        return webhookUrl != null && !webhookUrl.isBlank();
    }
}
