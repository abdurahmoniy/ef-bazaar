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
        kafka.send(SupportEvents.TOPIC_SUPPORT_MESSAGE_CREATED, event.chatId().toString(), event)
                .whenComplete((result, ex) -> {
                    if (ex != null) {
                        log.error("Failed to publish support message created event: chatId={}", event.chatId(), ex);
                    } else {
                        log.info("Published support message created event: chatId={} messageId={}",
                                event.chatId(), event.messageId());
                    }
                });
    }
}
