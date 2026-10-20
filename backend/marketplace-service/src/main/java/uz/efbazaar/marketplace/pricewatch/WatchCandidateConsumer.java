package uz.efbazaar.marketplace.pricewatch;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class WatchCandidateConsumer {
    private final ObjectMapper json;
    private final WatchDeliveryWorkflow workflow;
    public WatchCandidateConsumer(ObjectMapper json,WatchDeliveryWorkflow workflow){this.json=json;this.workflow=workflow;}
    @KafkaListener(topics="efbazaar.recommendation.watch-candidate",groupId="marketplace-watch-candidates",properties={"value.deserializer=org.apache.kafka.common.serialization.StringDeserializer","auto.offset.reset=earliest","spring.json.use.type.headers=false"})
    public void consume(String event)throws JsonProcessingException{workflow.accept(json.readValue(event,WatchMessages.Candidate.class));}
}
