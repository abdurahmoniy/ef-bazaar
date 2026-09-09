package uz.efbazaar.bot.guide;

import java.util.Optional;
import java.util.UUID;

/**
 * Qo'llanma tugmasining `callback_data` si.
 *
 * <p>Telegram tugma bosilganda faqat shu satrni qaytaradi, shuning uchun
 * qaysi qo'llanma ekani aynan unda bo'lishi kerak. Chegara — 64 bayt;
 * "guide:" + UUID = 42 bayt, ya'ni sig'adi.
 */
public final class GuideCallback {

    private static final String PREFIX = "guide:";

    private GuideCallback() {}

    public static String of(UUID guideId) {
        return PREFIX + guideId;
    }

    /** Qo'llanma tugmasi bo'lsa id, aks holda bo'sh. */
    public static Optional<UUID> parse(String data) {
        if (data == null || !data.startsWith(PREFIX)) return Optional.empty();
        try {
            return Optional.of(UUID.fromString(data.substring(PREFIX.length())));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
