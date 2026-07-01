package uz.efbazaar.auth.event;

import java.time.Instant;
import java.util.UUID;

/**
 * Event payloads produced by auth-service.
 * Topic names: {@code efbazaar.auth.*}.
 */
public final class AuthEvents {

    public static final String TOPIC_USER_REGISTERED   = "efbazaar.auth.user-registered";
    public static final String TOPIC_USER_LOGGED_IN    = "efbazaar.auth.user-logged-in";
    public static final String TOPIC_USER_DELETED      = "efbazaar.auth.user-deleted";
    public static final String TOPIC_GOOGLE_LINKED     = "efbazaar.auth.google-linked";
    public static final String TOPIC_USER_PHOTO_NEEDED = "efbazaar.auth.user-photo-needed";

    private AuthEvents() {}

    public record UserRegistered(
            UUID userId,
            Long telegramId,
            String telegramUsername,
            String displayName,
            /** Always {@code null} on a fresh register — kept for shape parity with {@link UserPhotoNeeded}. */
            String currentPhotoFileUniqueId,
            Instant occurredAt) {}

    public record UserLoggedIn(UUID userId, String method, Instant occurredAt) {}

    /**
     * Asks the bot to upload the user's profile photo to the media topic
     * (used to backfill users who registered before the photo pipeline existed,
     * or whose Mini App initData didn't include {@code photo_url}). Same shape
     * as {@link UserRegistered} so the bot's existing handler can reuse it.
     */
    public record UserPhotoNeeded(
            UUID userId,
            Long telegramId,
            String telegramUsername,
            String displayName,
            /**
             * Stored {@code file_unique_id} of the photo we already have in the
             * media topic, or {@code null} if none. Bot compares the user's current
             * Telegram photo against this and skips re-uploading on a match.
             */
            String currentPhotoFileUniqueId,
            Instant occurredAt) {}

    public record GoogleLinked(
            UUID userId,
            Long telegramId,
            String telegramUsername,
            String displayName,
            String email,
            Instant occurredAt) {}

    /**
     * User asked auth-service to delete their account. Downstream consumers
     * (marketplace-service, bot) MUST purge or anonymise the caller's data
     * — the row for this {@code userId} is already gone from auth's DB by
     * the time this event is published.
     */
    public record UserDeleted(
            UUID userId,
            Long telegramId,
            String email,
            Instant occurredAt) {}
}
