package uz.efbazaar.marketplace.guide;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class GuideDtos {

    private GuideDtos() {}

    public record GuideResponse(UUID id, String title, String description,
                                String videoFileId, Instant createdAt) {

        public static GuideResponse from(Guide g) {
            return new GuideResponse(g.getId(), g.getTitle(), g.getDescription(),
                    g.getVideoFileId(), g.getCreatedAt());
        }
    }

    /** Bitta tugma: yozuv va u ochadigan qo'llanma. */
    public record ButtonRequest(
            @NotBlank(message = "Tugma yozuvi bo'sh")
            @Size(max = 64, message = "Tugma yozuvi 64 belgidan oshmasin")
            String label,
            @NotNull(message = "Qo'llanma tanlanmagan")
            UUID guideId) {}

    /**
     * Butun ro'yxat bir marta saqlanadi.
     *
     * <p>Tugmalar tartibi ma'noga ega va uni bittalab saqlash bilan
     * boshqarish qiyin: har qo'shishda tartib raqamlarini qayta hisoblash
     * kerak bo'lardi. Ro'yxatni butunlay almashtirish soddaroq va
     * frontenddagi holat bilan aynan mos keladi.
     */
    public record SaveButtonsRequest(
            @Valid
            @Size(max = 20, message = "Tugmalar 20 tadan oshmasin")
            List<ButtonRequest> buttons) {}

    public record ButtonResponse(UUID id, String label, UUID guideId, String guideTitle) {

        public static ButtonResponse from(GuideButton b) {
            return new ButtonResponse(b.getId(), b.getLabel(),
                    b.getGuide().getId(), b.getGuide().getTitle());
        }
    }

    /** Bot uchun — tugma yozuvi va video birga, ikkinchi so'rov kerak bo'lmasin. */
    public record BotGuideButton(UUID guideId, String label,
                                 String description, String videoFileId) {

        public static BotGuideButton from(GuideButton b) {
            return new BotGuideButton(b.getGuide().getId(), b.getLabel(),
                    b.getGuide().getDescription(), b.getGuide().getVideoFileId());
        }
    }
}
