package uz.efbazaar.payment.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import uz.efbazaar.payment.plan.service.PlanService;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class PlanIdentityConsumerTest {
    private final PlanService plans=mock(PlanService.class);
    private final PlanIdentityConsumer consumer=new PlanIdentityConsumer(new ObjectMapper()
        .registerModule(new JavaTimeModule()).disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES),plans);
    @Test void authExtraFieldsDoNotBindTheConsumerToAnAuthJavaType() throws Exception {
        UUID id=UUID.randomUUID();
        consumer.onIdentity("{\"userId\":\""+id+"\",\"occurredAt\":\"2026-10-20T00:00:00Z\",\"displayName\":\"Fresh user\",\"telegramId\":123}");
        verify(plans).initializeIdentity(id);
    }
    @Test void incompleteIdentityNeverInitializesAUser() {
        for(String payload:java.util.List.of("null","{}","{\"userId\":\"a584ae59-6150-4149-869b-e91a0befd503\"}"))
            assertThatThrownBy(()->consumer.onIdentity(payload)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(plans);
    }
    @Test void malformedJsonNeverInitializesAUser() {
        assertThatThrownBy(()->consumer.onIdentity("not-json")).isInstanceOf(JsonProcessingException.class);
        verifyNoInteractions(plans);
    }
}
