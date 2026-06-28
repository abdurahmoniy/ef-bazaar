package uz.efbazaar.auth.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.repository.UserRepository;

/**
 * Persists profile-photo identifiers produced by the bot service after a
 * successful media-topic upload. Idempotent: if the user already has a file_id
 * we just overwrite — Telegram returns a fresh file_id for every upload anyway.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserPhotoSetConsumer {

    private final UserRepository userRepository;

    @KafkaListener(
            topics = "efbazaar.bot.user-photo-set",
            groupId = "auth-service-user-photo",
            properties = {"spring.json.value.default.type=uz.efbazaar.auth.kafka.UserPhotoSetDto"}
    )
    @Transactional
    public void onUserPhotoSet(UserPhotoSetDto e) {
        userRepository.findById(e.userId()).ifPresentOrElse(
                user -> {
                    user.setTelegramPhotoFileId(e.photoFileId());
                    user.setTelegramPhotoMessageId(
                            e.photoMessageId() == null ? null : e.photoMessageId().longValue());
                    userRepository.save(user);
                    log.info("Stored profile photo for userId={} fileId={} messageId={}",
                            e.userId(), e.photoFileId(), e.photoMessageId());
                },
                () -> log.warn("user-photo-set received for unknown userId={}", e.userId()));
    }
}
