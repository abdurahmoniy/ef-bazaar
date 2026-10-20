package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.plan.repository.UserSubscriptionRepository;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.plan.service.PlanEventPublisher;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;
import java.time.Instant;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
// Unlike PG-only fixtures, this class owns a real broker and creates identity topics.
@org.springframework.test.context.TestPropertySource(properties="spring.kafka.producer.properties.max.block.ms=2000")
class FreeWatchBootstrapIT extends AbstractIntegrationIT {
    @Autowired MockMvc mvc;
    @Autowired PlanService plans;
    @Autowired UserSubscriptionRepository subscriptions;
    @Autowired KafkaTemplate<String,Object> kafka;
    @SpyBean PlanEventPublisher events;

    @Test void firstAuthenticatedLookupPublishesARealFreeIdentityWithoutDuplicatingIt() throws Exception {
        UUID user=UUID.randomUUID();
        assertThat(subscriptions.existsById(user)).isFalse();
        for(int i=0;i<2;i++) mvc.perform(get("/api/v1/payments/plans/me").with(asUser(user)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("STANDARD"))
            .andExpect(jsonPath("$.entitlements['watch.search_limit']").value("1"));
        assertThat(subscriptions.findById(user)).isPresent();
        verify(events,times(1)).subscriptionChanged(eq(user),eq("STANDARD"),any(),isNull());
    }
    @Test void lateIdentityInitializationDoesNotReplaceAnExistingPaidSubscription() throws Exception {
        UUID user=UUID.randomUUID();Instant expires=Instant.now().plusSeconds(86400).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        plans.assign(user,"PRO",expires,"PURCHASE");clearInvocations(events);
        UUID barrierUser=UUID.randomUUID();
        kafka.send("efbazaar.auth.user-registered",user.toString(),Map.of("userId",user,
                "occurredAt",Instant.now().toString())).get(5,java.util.concurrent.TimeUnit.SECONDS);
        kafka.send("efbazaar.auth.user-registered",user.toString(),Map.of("userId",barrierUser,
                "occurredAt",Instant.now().toString())).get(5,java.util.concurrent.TimeUnit.SECONDS);
        await().atMost(Duration.ofSeconds(5)).untilAsserted(()->assertThat(subscriptions.findById(barrierUser)).isPresent());
        mvc.perform(get("/api/v1/payments/plans/me").with(asUser(user)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("PRO"));
        assertThat(subscriptions.findById(user).orElseThrow().getExpiresAt()).isEqualTo(expires);
        verify(events,never()).subscriptionChanged(eq(user),anyString(),any(),any());
    }
    @Test void registrationAndLoginInitializeNewFreeUsersThroughTheExistingKafkaIdentityBoundary() throws Exception {
        UUID user=UUID.randomUUID();
        Map<String,Object> event=Map.of("userId",user,"occurredAt",Instant.now().toString(),"displayName","Fresh user");
        kafka.send("efbazaar.auth.user-registered",user.toString(),event).get(5,java.util.concurrent.TimeUnit.SECONDS);
        await().atMost(Duration.ofSeconds(5)).untilAsserted(()->
            assertThat(subscriptions.findById(user)).isPresent());
        kafka.send("efbazaar.auth.user-logged-in",user.toString(),event).get(5,java.util.concurrent.TimeUnit.SECONDS);
        UUID barrierUser=UUID.randomUUID();
        // Same Kafka key/partition: observing the next identity proves the replay was consumed.
        kafka.send("efbazaar.auth.user-logged-in",user.toString(),Map.of("userId",barrierUser,
                "occurredAt",Instant.now().toString())).get(5,java.util.concurrent.TimeUnit.SECONDS);
        await().atMost(Duration.ofSeconds(5)).untilAsserted(()->assertThat(subscriptions.findById(barrierUser)).isPresent());
        verify(events,times(1)).subscriptionChanged(eq(user),eq("STANDARD"),any(),isNull());
        assertThat(subscriptions.findById(user).orElseThrow().getPlanCode()).isEqualTo("STANDARD");
    }
}
