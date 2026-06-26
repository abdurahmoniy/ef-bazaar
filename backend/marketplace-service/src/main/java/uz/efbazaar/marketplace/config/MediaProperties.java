package uz.efbazaar.marketplace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "app.media")
public record MediaProperties(
        int minFiles,
        int maxFiles,
        int maxFileSizeMb,
        List<String> allowedTypes
) {
    public long maxFileSizeBytes() {
        return (long) maxFileSizeMb * 1024 * 1024;
    }
}
