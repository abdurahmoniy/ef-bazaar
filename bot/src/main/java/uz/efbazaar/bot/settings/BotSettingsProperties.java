package uz.efbazaar.bot.settings;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * marketplace-service'ning ichki API'siga ulanish. {@code secret} bo'sh bo'lsa
 * so'rov 403 bilan qaytadi va bot standart matnga tushadi — sozlanmagan bot
 * ishlashda davom etadi, shunchaki matnni tahrirlab bo'lmaydi.
 */
@ConfigurationProperties(prefix = "app.marketplace")
public record BotSettingsProperties(String internalBaseUrl, String secret) {}
