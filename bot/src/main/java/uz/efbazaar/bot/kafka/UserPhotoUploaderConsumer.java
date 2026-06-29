package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import uz.efbazaar.bot.telegram.TelegramApiClient.ProfilePhoto;

import java.time.Instant;
import java.util.Optional;

/**
 * Keeps the user's profile photo in the media topic in sync with whatever
 * Telegram currently has, while avoiding redundant uploads.
 *
 * <p>Flow per event:
 * <ol>
 *   <li>Ask Telegram for the user's current profile photo (file_id + file_unique_id).</li>
 *   <li>If the user has no public photo — skip.</li>
 *   <li>If {@code currentPhotoFileUniqueId} from auth matches the live one — skip
 *       (we already uploaded this exact image; DB and media topic are up to date).</li>
 *   <li>Otherwise, forward via {@code sendPhoto} (file_id, no re-upload) into the
 *       media topic with an audit caption, then publish {@code user-photo-set}
 *       so auth-service persists the new identifiers.</li>
 * </ol>
 *
 * <p>Two listeners share the same handler: {@code user-registered} (fresh signup)
 * and {@code user-photo-needed} (login-time sync). The {@code reason} string
 * makes the source visible in the media-topic caption.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserPhotoUploaderConsumer {

    private static final String OUTPUT_TOPIC = "efbazaar.bot.user-photo-set";

    private final TelegramApiClient telegram;
    private final TelegramProperties props;
    private final KafkaTemplate<String, Object> kafka;

    @KafkaListener(
            topics = "efbazaar.auth.user-registered",
            groupId = "bot-user-photo-uploader",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.UserRegisteredDto"}
    )
    public void onUserRegistered(UserRegisteredDto e) {
        sync(e, "register");
    }

    @KafkaListener(
            topics = "efbazaar.auth.user-photo-needed",
            groupId = "bot-user-photo-backfill",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.UserRegisteredDto"}
    )
    public void onUserPhotoNeeded(UserRegisteredDto e) {
        sync(e, "sync");
    }

    private void sync(UserRegisteredDto e, String reason) {
        try {
            Optional<ProfilePhoto> liveOpt = telegram.getUserProfilePhoto(e.telegramId());
            if (liveOpt.isEmpty()) {
                log.info("[{}] No public profile photo for telegramId={} userId={} — skipping",
                        reason, e.telegramId(), e.userId());
                return;
            }
            ProfilePhoto live = liveOpt.get();

            if (live.fileUniqueId() != null
                    && live.fileUniqueId().equals(e.currentPhotoFileUniqueId())) {
                log.info("[{}] Profile photo unchanged for userId={} (file_unique_id={}) — skipping",
                        reason, e.userId(), live.fileUniqueId());
                return;
            }

            String caption = buildAuditCaption(e, live, reason);
            var uploaded = telegram.sendPhotoByFileId(
                    props.groupChatId(),
                    props.topics().media(),
                    live.fileId(),
                    caption);

            if (uploaded.isEmpty()) {
                log.warn("[{}] Failed to upload profile photo to media topic for userId={}",
                        reason, e.userId());
                return;
            }

            // file_unique_id sendPhoto javobida ham bo'lishi kerak, lekin bo'lmasa
            // manba'dagi qiymatni ishlatamiz (bir xil tarkib — bir xil identifier).
            String storedFileUniqueId = uploaded.get().fileUniqueId() != null
                    ? uploaded.get().fileUniqueId()
                    : live.fileUniqueId();

            kafka.send(OUTPUT_TOPIC, e.userId().toString(),
                    new UserPhotoSetEvent(
                            e.userId(),
                            e.telegramId(),
                            uploaded.get().fileId(),
                            storedFileUniqueId,
                            uploaded.get().messageId(),
                            Instant.now()));

            log.info("[{}] Profile photo uploaded for userId={} messageId={} fileId={} fileUniqueId={}",
                    reason, e.userId(), uploaded.get().messageId(),
                    uploaded.get().fileId(), storedFileUniqueId);
        } catch (Exception ex) {
            log.error("[{}] UserPhotoUploader failed for userId={}: {}",
                    reason, e.userId(), ex.getMessage(), ex);
        }
    }

    private static String buildAuditCaption(UserRegisteredDto e, ProfilePhoto live, String reason) {
        return "👤 <b>Profile rasm</b> <i>(" + reason + ")</i>\n" +
                "<b>Ism:</b> " + escape(e.displayName()) + "\n" +
                (e.telegramUsername() != null && !e.telegramUsername().isBlank()
                        ? "<b>Username:</b> @" + escape(e.telegramUsername()) + "\n"
                        : "") +
                "<b>Telegram ID:</b> <code>" + e.telegramId() + "</code>\n" +
                "<b>User ID:</b> <code>" + e.userId() + "</code>\n" +
                "<b>file_unique_id:</b> <code>" + escape(live.fileUniqueId()) + "</code>";
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
