package uz.efbazaar.marketplace.emoji;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class EmojiPackDtos {

    private EmojiPackDtos() {}

    public record AddPackRequest(
            @NotBlank(message = "Havola bo'sh")
            @Size(max = 300, message = "Havola juda uzun")
            String link) {}

    /** Ro'yxat uchun — ichidagi emoji'lar tortilmaydi. */
    public record PackSummary(UUID id, String setName, String title, int count,
                              Instant addedAt, Instant refreshedAt) {

        public static PackSummary from(EmojiPack p) {
            return new PackSummary(p.getId(), p.getSetName(), p.getTitle(),
                    p.getItems().size(), p.getAddedAt(), p.getRefreshedAt());
        }
    }

    public record PackDetail(UUID id, String setName, String title, List<EmojiItem> items) {

        public static PackDetail from(EmojiPack p) {
            return new PackDetail(p.getId(), p.getSetName(), p.getTitle(),
                    p.getItems().stream().map(EmojiItem::from).toList());
        }
    }

    /**
     * @param thumbnailUrl panelda ko'rsatiladigan statik variant
     * @param fileUrl      preview'da harakatlanib ko'rinadigan asl fayl
     *
     * <p>Havolalarni frontend emas, backend quradi: yo'l shakli
     * (`/bot/emoji/...`) bot servisining ishi va u o'zgarsa, bir joyda
     * o'zgarishi kerak.
     */
    public record EmojiItem(String customEmojiId, String emoji, String format,
                            String thumbnailUrl, String fileUrl) {

        public static EmojiItem from(EmojiPackItem i) {
            return new EmojiItem(
                    i.getCustomEmojiId(), i.getEmoji(), i.getFormat(),
                    "/bot/emoji/" + i.getThumbnailFileId(),
                    "/bot/emoji/" + i.getFileId());
        }
    }
}
