package uz.efbazaar.outbox.it;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;
import uz.efbazaar.outbox.internal.OutboxRelay;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class OutboxRelayIT extends AbstractOutboxIT {

    public record Sample(String name, int n) {}

    @Autowired Outbox outbox;
    @Autowired OutboxRelay relay;
    @Autowired TransactionTemplate tx;
    @Autowired ControllableSender sender;
    @Autowired KafkaTemplate<Object, Object> directTemplate;

    @AfterEach
    void reset() {
        sender.mode(ControllableSender.Mode.PASS);
    }

    private String topic() {
        return "it-" + UUID.randomUUID();
    }

    private List<ConsumerRecord<String, byte[]>> consume(String topic, int expected) {
        Map<String, Object> props = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        List<ConsumerRecord<String, byte[]>> out = new ArrayList<>();
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of(topic));
            long deadline = System.currentTimeMillis() + 15_000;
            while (out.size() < expected && System.currentTimeMillis() < deadline) {
                consumer.poll(Duration.ofMillis(200)).forEach(out::add);
            }
        }
        return out;
    }

    @Test
    void deliversOnCommitWithoutWaitingForPoll() {
        String topic = topic();
        long start = System.nanoTime();
        tx.executeWithoutResult(s -> outbox.publish(topic, "k1", new Sample("a", 1)));

        await().atMost(Duration.ofSeconds(5)).until(() -> relay.pendingIsEmpty());
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
        assertThat(consume(topic, 1)).hasSize(1);
    }

    @Test
    void wireFormatIsIdenticalToDirectSend() throws Exception {
        String viaOutbox = topic();
        String direct = topic();
        tx.executeWithoutResult(s -> outbox.publish(viaOutbox, "k", new Sample("a", 1)));
        directTemplate.send(direct, "k", new Sample("a", 1)).get();

        ConsumerRecord<String, byte[]> a = consume(viaOutbox, 1).get(0);
        ConsumerRecord<String, byte[]> b = consume(direct, 1).get(0);

        assertThat(a.key()).isEqualTo(b.key());
        assertThat(a.value()).isEqualTo(b.value());
        assertThat(new String(a.headers().lastHeader("__TypeId__").value(), StandardCharsets.UTF_8))
                .isEqualTo(new String(b.headers().lastHeader("__TypeId__").value(), StandardCharsets.UTF_8));
    }

    @Test
    void keepsPerKeyOrder() {
        String topic = topic();
        for (int i = 0; i < 20; i++) {
            int n = i;
            tx.executeWithoutResult(s -> outbox.publish(topic, "same", new Sample("x", n)));
        }
        List<ConsumerRecord<String, byte[]>> got = consume(topic, 20);
        assertThat(got).hasSize(20);
        for (int i = 0; i < 20; i++) {
            assertThat(new String(got.get(i).value(), StandardCharsets.UTF_8)).contains("\"n\":" + i);
        }
    }

    @Test
    void nullKeyIsSentWithNullKey() {
        String topic = topic();
        tx.executeWithoutResult(s -> outbox.publish(topic, null, new Sample("a", 1)));
        assertThat(consume(topic, 1).get(0).key()).isNull();
    }

    @Test
    void failedSendStaysPendingAndIsDeliveredLaterInOrder() {
        String topic = topic();
        sender.mode(ControllableSender.Mode.FAIL);
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("first", 1)));
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("second", 2)));
        relay.drainNow();

        // commit'dagi uyg'otish ham parallel ishlaydi — uning tranzaksiyasi tugashini kutamiz
        await().atMost(Duration.ofSeconds(5)).until(() ->
                jdbc.queryForObject("SELECT max(attempts) FROM outbox_events", Integer.class) >= 1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE published_at IS NULL", Long.class)).isEqualTo(2);

        sender.mode(ControllableSender.Mode.PASS);
        relay.drainNow();

        List<ConsumerRecord<String, byte[]>> got = consume(topic, 2);
        assertThat(got).extracting(r -> new String(r.value(), StandardCharsets.UTF_8))
                .satisfiesExactly(v -> assertThat(v).contains("first"), v -> assertThat(v).contains("second"));
    }

    @Test
    void hangingBrokerIsBoundedBySendTimeout() {
        String topic = topic();
        sender.mode(ControllableSender.Mode.HANG);
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("a", 1)));

        // Uyg'otilgan relay send-timeout (3 s) tugagach yozuvni attempts=1 bilan qo'yib yuborishi kerak —
        // qulf cheksiz ushlanmaydi.
        await().atMost(Duration.ofSeconds(8)).until(() ->
                jdbc.queryForObject("SELECT attempts FROM outbox_events", Integer.class) >= 1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE published_at IS NULL", Long.class)).isEqualTo(1);
    }

    @Test
    void relaySurvivesUnexpectedExceptionAndKeepsWorking() {
        String topic = topic();
        sender.mode(ControllableSender.Mode.THROW);
        tx.executeWithoutResult(s -> outbox.publish(topic, "k", new Sample("a", 1)));
        relay.drainNow();

        sender.mode(ControllableSender.Mode.PASS);
        relay.wake();

        await().atMost(Duration.ofSeconds(5)).until(() -> relay.pendingIsEmpty());
        assertThat(consume(topic, 1)).hasSize(1);
    }
}
