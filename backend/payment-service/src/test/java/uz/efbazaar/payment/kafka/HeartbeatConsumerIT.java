package uz.efbazaar.payment.kafka;

import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.test.utils.ContainerTestUtils;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * The heartbeat topic is fed by a process outside this codebase, so one day it
 * will carry something this service cannot read. That message must cost one
 * offset, not the listener.
 *
 * <p>The failure mode is quiet but expensive: no heartbeats means
 * {@link UserbotHealth} reports unhealthy, which means deposits are refused.
 * That is the safe direction — nobody loses money — but a listener that dies
 * on a single bad byte never recovers, so a moment's noise on the topic turns
 * into an indefinite deposit outage.
 */
@SpringBootTest
class HeartbeatConsumerIT extends AbstractIntegrationIT {

    @Autowired UserbotHealth health;
    @Autowired KafkaTemplate<String, Object> template;
    @Autowired KafkaListenerEndpointRegistry listeners;

    /**
     * auto.offset.reset is {@code latest}: anything published before the
     * consumer owns the partition is never seen at all, which would make this
     * test pass or fail on startup timing rather than on the behaviour it
     * means to pin down.
     */
    @BeforeEach
    void waitForTheListenerToOwnItsPartition() {
        for (MessageListenerContainer container : listeners.getListenerContainers()) {
            ContainerTestUtils.waitForAssignment(container, 1);
        }
    }

    @Test
    void aMalformedHeartbeatIsSkippedAndTheNextRealOneStillLands() {
        Optional<Instant> seenBefore = health.lastSeenAt();
        boolean healthyBefore = health.isHealthy();

        publishRaw("{ this is not a heartbeat".getBytes(StandardCharsets.UTF_8));

        // Held for a few seconds rather than asserted once: a bare assertion
        // here would pass just by racing ahead of the consumer's next poll.
        //
        // Asserts "nothing moved" rather than a literal "still unhealthy",
        // because UserbotHealth is a singleton with no reset — the monotonic
        // guard is deliberate — so whether the sibling test has already
        // stamped a beat depends on method order. A malformed record
        // contributing nothing is the claim that holds either way, and in a
        // fresh context, where the bot starts unhealthy, it is exactly the
        // claim that the poison pill did not mark it healthy.
        await().during(Duration.ofSeconds(3)).atMost(Duration.ofSeconds(15))
                .until(() -> health.lastSeenAt().equals(seenBefore)
                        && health.isHealthy() == healthyBefore);

        Instant beat = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        template.send(PaymentTopics.USERBOT_HEARTBEAT,
                new HeartbeatConsumer.HeartbeatEvent(beat));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            assertThat(health.lastSeenAt())
                    .as("the listener must survive the poison pill and keep consuming past it")
                    .contains(beat);
            assertThat(health.isHealthy()).isTrue();
        });
    }

    /**
     * The only producer on this topic is the Python humo-userbot, which sends
     * plain JSON with no {@code __TypeId__} header — the header a Java
     * {@code KafkaTemplate}/{@code JsonSerializer} stamps automatically and
     * that {@code JsonDeserializer} otherwise needs to know what to build.
     * Sending this through the app's own template instead of raw bytes would
     * make the test pass while production could not read a single heartbeat.
     */
    @Test
    void aBareJsonHeartbeatFromTheNonJavaProducerIsUnderstood() {
        Instant beat = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        publishRaw(("{\"sentAt\":\"" + beat + "\"}").getBytes(StandardCharsets.UTF_8));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            assertThat(health.lastSeenAt())
                    .as("a heartbeat carrying no Java type header is still a heartbeat")
                    .contains(beat);
            assertThat(health.isHealthy()).isTrue();
        });
    }

    /** Bypasses the app's producer on purpose — the point is bytes it cannot read. */
    private void publishRaw(byte[] payload) {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        try (var producer = new KafkaProducer<String, byte[]>(props)) {
            producer.send(new ProducerRecord<>(PaymentTopics.USERBOT_HEARTBEAT, payload));
            producer.flush();
        }
    }
}
