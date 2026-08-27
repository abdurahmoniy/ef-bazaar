package uz.efbazaar.marketplace.botsettings;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class BotSettingsDtos {

    private BotSettingsDtos() {}

    /**
     * Bot ham, adminka ham shu javobni oladi.
     *
     * @param bannerFileId NULL bo'lsa bot bannersiz, oddiy matnli xabar yuboradi
     */
    public record BotSettingsResponse(
            String welcomeText,
            String bannerFileId,
            Instant updatedAt
    ) {
        public static BotSettingsResponse from(BotSettings s) {
            return new BotSettingsResponse(s.getWelcomeText(), s.getBannerFileId(), s.getUpdatedAt());
        }
    }

    /**
     * Matnni yangilash so'rovi.
     *
     * <p>Bu yerdagi {@code @Size} faqat qo'pol yuqori chegara — bannersiz
     * xabarning Telegram limiti. Haqiqiy tekshiruv
     * {@link BotSettingsService#validateLength} da: u banner bor-yo'qligiga
     * qarab 1024 yoki 4096 ni qo'llaydi va uzunlikni HTML teglarsiz o'lchaydi,
     * chunki Telegram ham teglarni sanamaydi.
     */
    public record UpdateBotSettingsRequest(
            @NotBlank(message = "Matn bo'sh bo'lmasligi kerak")
            @Size(max = 4096, message = "Matn juda uzun")
            String welcomeText
    ) {}
}
