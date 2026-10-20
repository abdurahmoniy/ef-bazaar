package uz.efbazaar.payment.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.plan.service.PlanService;
import java.time.Instant;
import java.util.UUID;

/** Identity birth/recovery never assigns a plan over an existing subscription. */
@Component
@RequiredArgsConstructor
public class PlanIdentityConsumer {
    private final ObjectMapper mapper;
    private final PlanService plans;
    public record IdentityEvent(UUID userId, Instant occurredAt) {}

    @KafkaListener(topics={"efbazaar.auth.user-registered","efbazaar.auth.user-logged-in"},
            groupId="payment-service-plan-identities",
            properties={"value.deserializer=org.apache.kafka.common.serialization.StringDeserializer",
                    "spring.json.use.type.headers=false","auto.offset.reset=earliest"})
    public void onIdentity(String payload) throws JsonProcessingException {
        IdentityEvent event = mapper.readValue(payload, IdentityEvent.class);
        if (event == null || event.userId() == null || event.occurredAt() == null)
            throw new IllegalArgumentException("Auth identity event requires userId and occurredAt");
        plans.initializeIdentity(event.userId());
    }
}
