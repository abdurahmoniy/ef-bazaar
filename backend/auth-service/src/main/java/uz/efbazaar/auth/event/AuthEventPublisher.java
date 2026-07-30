package uz.efbazaar.auth.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthEventPublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void userRegistered(User user) {
        var event = new AuthEvents.UserRegistered(
                user.getId(),
                user.getTelegramId(),
                user.getTelegramUsername(),
                user.displayName(),
                user.getTelegramPhotoFileUniqueId(),
                Instant.now());
        send(AuthEvents.TOPIC_USER_REGISTERED, user.getId().toString(), event);
    }

    public void userLoggedIn(UUID userId, String method) {
        var event = new AuthEvents.UserLoggedIn(userId, method, Instant.now());
        send(AuthEvents.TOPIC_USER_LOGGED_IN, userId.toString(), event);
    }

    public void userPhotoNeeded(User user) {
        var event = new AuthEvents.UserPhotoNeeded(
                user.getId(),
                user.getTelegramId(),
                user.getTelegramUsername(),
                user.displayName(),
                user.getTelegramPhotoFileUniqueId(),
                Instant.now());
        send(AuthEvents.TOPIC_USER_PHOTO_NEEDED, user.getId().toString(), event);
    }

    public void googleLinked(User user) {
        var event = new AuthEvents.GoogleLinked(
                user.getId(),
                user.getTelegramId(),
                user.getTelegramUsername(),
                user.displayName(),
                user.getEmail(),
                Instant.now());
        send(AuthEvents.TOPIC_GOOGLE_LINKED, user.getId().toString(), event);
    }

    public void userDeleted(UUID userId, Long telegramId, String email) {
        var event = new AuthEvents.UserDeleted(userId, telegramId, email, Instant.now());
        send(AuthEvents.TOPIC_USER_DELETED, userId.toString(), event);
    }

    public void userRoleChanged(UUID userId, Role oldRole, Role newRole) {
        var event = new AuthEvents.UserRoleChanged(
                userId,
                oldRole == null ? null : oldRole.name(),
                newRole == null ? null : newRole.name(),
                Instant.now());
        send(AuthEvents.TOPIC_USER_ROLE_CHANGED, userId.toString(), event);
    }

    private void send(String topic, String key, Object event) {
        kafkaTemplate.send(topic, key, event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish event to {} key={}: {}", topic, key, ex.getMessage());
                    } else {
                        log.debug("Published event to {} key={} partition={}",
                                topic, key, result.getRecordMetadata().partition());
                    }
                });
    }
}
