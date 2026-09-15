package uz.efbazaar.access.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app")
public record AccessProperties(Internal internal, Bot bot, Check check) {

    /** {@code /internal/**} uchun umumiy sir. Bo'sh — hamma ichki so'rov rad etiladi. */
    public record Internal(String secret) {}

    /** Telegram chaqiruvlari bot orqali o'tadi: token faqat botda. */
    public record Bot(String internalBaseUrl) {}

    /** Bajarilgan shart natijasi keshda qancha turadi. */
    public record Check(Duration metCacheTtl) {}
}
