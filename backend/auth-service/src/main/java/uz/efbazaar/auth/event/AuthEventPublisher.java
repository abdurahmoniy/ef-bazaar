package uz.efbazaar.auth.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthEventPublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void userRegistered(UUID userId, Long telegramId, String displayName) {
        var event = new AuthEvents.UserRegistered(userId, telegramId, displayName, Instant.now());
        send(AuthEvents.TOPIC_USER_REGISTERED, userId.toString(), event);
    }

    public void userLoggedIn(UUID userId, String method) {
        var event = new AuthEvents.UserLoggedIn(userId, method, Instant.now());
        send(AuthEvents.TOPIC_USER_LOGGED_IN, userId.toString(), event);
    }

    public void googleLinked(UUID userId, String email) {
        var event = new AuthEvents.GoogleLinked(userId, email, Instant.now());
        send(AuthEvents.TOPIC_GOOGLE_LINKED, userId.toString(), event);
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
