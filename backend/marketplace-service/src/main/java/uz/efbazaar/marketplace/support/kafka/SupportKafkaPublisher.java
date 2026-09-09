package uz.efbazaar.marketplace.support.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class SupportKafkaPublisher {

    private final KafkaTemplate<String, Object> kafka;

    public void publishMessageCreated(SupportEvents.SupportMessageCreatedEvent event) {
        if (event == null || event.chatId() == null) {
            log.warn("Cannot publish null support message created event");
            return;
        }
        try {
            kafka.send(SupportEvents.TOPIC_SUPPORT_MESSAGE_CREATED, event.chatId().toString(), event)
                    .whenComplete((result, ex) -> {
                        if (ex != null) {
                            log.error("Failed to publish support message created event: chatId={}", event.chatId(), ex);
                        } else {
                            log.info("Published support message created event: chatId={} messageId={}",
                                    event.chatId(), event.messageId());
                        }
                    });
        } catch (Exception ex) {
            log.error("Synchronous error when dispatching Kafka support message created event: chatId={}", event.chatId(), ex);
        }
    }
}
