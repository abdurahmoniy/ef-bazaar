package uz.efbazaar.marketplace.plan;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PlanProjectionConsumer {
    private final ObjectMapper mapper;
    private final PlanProjection projection;
    @KafkaListener(topics = PlanEvents.TOPIC_PLAN_ENTITLEMENTS, groupId = "marketplace-service-plan-entitlements",
        properties = {"value.deserializer=org.apache.kafka.common.serialization.StringDeserializer", "auto.offset.reset=earliest", "spring.json.use.type.headers=false"})
    public void onPlanEntitlements(String json) throws JsonProcessingException {
        var e = mapper.readValue(json, PlanEvents.PlanEntitlementsSnapshot.class);
        if (e != null) projection.replacePlan(e.planCode(), e.entitlements(), e.version(), e.idempotencyKey(), e.occurredAt());
    }
    @KafkaListener(topics = PlanEvents.TOPIC_SUBSCRIPTION_CHANGED, groupId = "marketplace-service-subscription-changed",
        properties = {"value.deserializer=org.apache.kafka.common.serialization.StringDeserializer", "auto.offset.reset=earliest", "spring.json.use.type.headers=false"})
    public void onSubscriptionChanged(String json) throws JsonProcessingException {
        var e = mapper.readValue(json, PlanEvents.SubscriptionChanged.class);
        if (e != null) projection.userMoved(e.userId(), e.planCode(), e.expiresAt(), e.version(), e.idempotencyKey(), e.occurredAt());
    }
}
