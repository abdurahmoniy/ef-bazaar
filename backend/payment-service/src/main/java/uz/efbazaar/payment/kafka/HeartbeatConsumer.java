package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.health.UserbotHealth;

import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class HeartbeatConsumer {

    private final UserbotHealth health;

    public record HeartbeatEvent(Instant sentAt) {}

    // The producer is the Python humo-userbot, so records arrive as bare JSON with
    // no __TypeId__ header — without a declared default type JsonDeserializer has
    // nothing to build and every heartbeat is dropped. Same pattern trade-service
    // uses on all thirteen of its smart-admin-worker topics.
    @KafkaListener(
            topics = PaymentTopics.USERBOT_HEARTBEAT,
            groupId = "payment-service-userbot-heartbeat",
            properties = {"spring.json.value.default.type=uz.efbazaar.payment.kafka.HeartbeatConsumer$HeartbeatEvent"})
    public void onHeartbeat(HeartbeatEvent event) {
        if (event == null || event.sentAt() == null) {
            log.warn("heartbeat with no timestamp, ignoring");
            return;
        }
        health.record(event.sentAt());
    }
}
