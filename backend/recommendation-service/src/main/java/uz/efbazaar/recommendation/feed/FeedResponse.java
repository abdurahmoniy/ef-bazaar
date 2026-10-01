package uz.efbazaar.recommendation.feed;

import java.util.List;
import java.util.UUID;

/** {@code empty = true} → frontend "Katta bozor"ga o'tadi (mehmon, bo'sh profil yoki mos e'lon yo'q). */
public record FeedResponse(boolean empty, String profileHash, List<UUID> ids) {

    public static final FeedResponse EMPTY = new FeedResponse(true, null, List.of());

    public static FeedResponse of(String profileHash, List<UUID> ids) {
        return new FeedResponse(ids.isEmpty(), profileHash, ids);
    }
}
