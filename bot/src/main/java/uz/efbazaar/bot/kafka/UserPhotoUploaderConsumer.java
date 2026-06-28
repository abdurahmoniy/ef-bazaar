package uz.efbazaar.bot.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Instant;
import java.util.Optional;

/**
 * On user-registered, fetch the user's Telegram profile photo and forward it
 * into the media topic. Posts a separate, plaintext "audit row" message right
 * after the photo so a developer scrolling the topic can match a photo to its
 * owning user without having to query the database.
 *
 * <p>Publishes {@code efbazaar.bot.user-photo-set} with the resulting file_id +
 * message_id so auth-service can persist them.
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
        upload(e, "register");
    }

    /**
     * Backfill — auth-service publishes this on login when a user has no stored
     * photo (either they registered before this pipeline existed, or their Mini
     * App initData didn't include {@code photo_url}). Same handler as registration.
     */
    @KafkaListener(
            topics = "efbazaar.auth.user-photo-needed",
            groupId = "bot-user-photo-backfill",
            properties = {"spring.json.value.default.type=uz.efbazaar.bot.kafka.UserRegisteredDto"}
    )
    public void onUserPhotoNeeded(UserRegisteredDto e) {
        upload(e, "backfill");
    }

    private void upload(UserRegisteredDto e, String reason) {
        try {
            Optional<String> fileIdOpt = telegram.getUserProfilePhotoFileId(e.telegramId());
            if (fileIdOpt.isEmpty()) {
                log.info("[{}] No public profile photo for telegramId={} userId={} — skipping",
                        reason, e.telegramId(), e.userId());
                return;
            }
            String sourceFileId = fileIdOpt.get();

            String caption = buildAuditCaption(e, sourceFileId, reason);
            var uploaded = telegram.sendPhotoByFileId(
                    props.groupChatId(),
                    props.topics().media(),
                    sourceFileId,
                    caption);

            if (uploaded.isEmpty()) {
                log.warn("[{}] Failed to upload profile photo to media topic for userId={}", reason, e.userId());
                return;
            }

            // file_id Telegram tomonidan har sendPhoto da yangidan beriladi — DB ga shu yangisini saqlash
            // kerak (bot o'z yuborgan rasmiga doim getFile qila oladi).
            String storedFileId = uploaded.get().fileId();
            int messageId = uploaded.get().messageId();

            kafka.send(OUTPUT_TOPIC, e.userId().toString(),
                    new UserPhotoSetEvent(
                            e.userId(),
                            e.telegramId(),
                            storedFileId,
                            messageId,
                            Instant.now()));

            log.info("[{}] Profile photo uploaded for userId={} messageId={} fileId={}",
                    reason, e.userId(), messageId, storedFileId);
        } catch (Exception ex) {
            log.error("[{}] UserPhotoUploader failed for userId={}: {}",
                    reason, e.userId(), ex.getMessage(), ex);
        }
    }

    private static String buildAuditCaption(UserRegisteredDto e, String sourceFileId, String reason) {
        return "👤 <b>Profile rasm</b> <i>(" + reason + ")</i>\n" +
                "<b>Ism:</b> " + escape(e.displayName()) + "\n" +
                (e.telegramUsername() != null && !e.telegramUsername().isBlank()
                        ? "<b>Username:</b> @" + escape(e.telegramUsername()) + "\n"
                        : "") +
                "<b>Telegram ID:</b> <code>" + e.telegramId() + "</code>\n" +
                "<b>User ID:</b> <code>" + e.userId() + "</code>\n" +
                "<b>Source file_id:</b> <code>" + escape(sourceFileId) + "</code>";
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
