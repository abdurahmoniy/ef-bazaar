package uz.efbazaar.outbox.it;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;
import uz.efbazaar.outbox.internal.OutboxRelay;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

class OutboxSnapshotIT extends AbstractOutboxIT {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired Outbox outbox;
    @Autowired OutboxRelay relay;
    @Autowired TransactionTemplate tx;
    @Autowired TestSnapshotSource source;
    @Autowired ControllableSender sender;

    private KafkaConsumer<String, byte[]> consumer;

    @BeforeEach
    void subscribe() {
        consumer = new KafkaConsumer<>(Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "snap-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class));
        consumer.subscribe(List.of(TestSnapshotSource.TOPIC));
        consumer.poll(Duration.ofSeconds(2)); // partition biriktirilishi uchun
        source.state.clear();
        source.builds.set(0);
    }

    @AfterEach
    void close() {
        consumer.close();
        sender.mode(ControllableSender.Mode.PASS);
        // Qolgan belgilarni yuborib, backoff holatini nolga qaytaradi — keyingi test toza relay bilan boshlanadi.
        relay.drainNow();
    }

    private List<ConsumerRecord<String, byte[]>> read(int expected) {
        List<ConsumerRecord<String, byte[]>> out = new ArrayList<>();
        long deadline = System.currentTimeMillis() + 10_000;
        while (out.size() < expected && System.currentTimeMillis() < deadline) {
            consumer.poll(Duration.ofMillis(200)).forEach(out::add);
        }
        return out;
    }

    private JsonNode json(ConsumerRecord<String, byte[]> r) throws Exception {
        return JSON.readTree(r.value());
    }

    @Test
    void severalMarksCollapseIntoOneCurrentSnapshot() throws Exception {
        source.state.put("A", "v1");
        tx.executeWithoutResult(s -> {
            outbox.markSnapshot("thing", "A");
            outbox.markSnapshot("thing", "A");
            source.state.put("A", "v2");
        });
        relay.drainNow();

        List<ConsumerRecord<String, byte[]>> got = read(1);
        assertThat(got).hasSize(1);
        assertThat(got.get(0).key()).isEqualTo("key-A");
        assertThat(json(got.get(0)).get("value").asText()).isEqualTo("v2");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void versionsGrowAcrossSnapshots() throws Exception {
        source.state.put("A", "v1");
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "A"));
        relay.drainNow();
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "A"));
        relay.drainNow();

        List<ConsumerRecord<String, byte[]>> got = read(2);
        assertThat(json(got.get(1)).get("version").asLong()).isGreaterThan(json(got.get(0)).get("version").asLong());
    }

    @Test
    void emptyBuildDropsMarkWithoutSending() {
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "missing"));
        relay.drainNow();

        await().atMost(Duration.ofSeconds(5)).until(() ->
                jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class) == 0);
        assertThat(source.builds.get()).isEqualTo(1);
        assertThat(read(1)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void unknownSourceMarkIsDropped() {
        tx.executeWithoutResult(s -> outbox.markSnapshot("nobody-owns-this", "X"));
        relay.drainNow();

        // commit'da uyg'ongan relay belgini qulflagan bo'lishi mumkin — drainNow uni SKIP LOCKED
        // bilan o'tkazib yuboradi; ishchi ip tugashini kutamiz.
        await().atMost(Duration.ofSeconds(5)).until(() ->
                jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class) == 0);
    }

    @Test
    void failedSendKeepsMarkForNextRound() {
        source.state.put("A", "v1");
        sender.mode(ControllableSender.Mode.FAIL);
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "A"));
        relay.drainNow();
        await().atMost(Duration.ofSeconds(5)).until(() -> sender.failuresSeen() >= 1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isEqualTo(1);

        sender.mode(ControllableSender.Mode.PASS);
        relay.drainNow();
        assertThat(read(1)).hasSize(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void businessMarkNeverWaitsForRelayAndNewerMarkSurvivesTheSend() throws Exception {
        source.state.put("S", "v1");
        java.util.concurrent.CountDownLatch inBuild = source.blockNextBuild("S");
        tx.executeWithoutResult(s -> outbox.markSnapshot("thing", "S"));
        assertThat(inBuild.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        try {
            // Relay "S" ni qurayotgan paytda foydalanuvchi e'lonni yana tahrirlaydi.
            java.util.concurrent.CompletableFuture<Void> business = java.util.concurrent.CompletableFuture.runAsync(() ->
                    tx.executeWithoutResult(s -> {
                        source.state.put("S", "v2");
                        outbox.markSnapshot("thing", "S");
                    }));
            business.get(1, java.util.concurrent.TimeUnit.SECONDS);
        } finally {
            source.release();
        }

        List<ConsumerRecord<String, byte[]>> first = read(1);
        assertThat(first).hasSize(1);
        // Yangi belgi relay o'chirmasligi kerak — keyingi aylanish v2 ni yuboradi.
        await().atMost(Duration.ofSeconds(5)).until(() -> {
            relay.drainNow();
            return jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class) == 0;
        });
        List<ConsumerRecord<String, byte[]>> all = new ArrayList<>(first);
        all.addAll(read(1));
        assertThat(json(all.get(all.size() - 1)).get("value").asText()).isEqualTo("v2");
    }

    @Test
    void permanentlyRejectedSnapshotIsDroppedAndOthersFlow() throws Exception {
        source.state.put("P", "poison");
        source.state.put("G", "good");
        sender.mode(ControllableSender.Mode.POISON);
        tx.executeWithoutResult(s -> {
            outbox.markSnapshot("thing", "P");
            outbox.markSnapshot("thing", "G");
        });
        relay.drainNow();

        List<ConsumerRecord<String, byte[]>> got = read(1);
        assertThat(got).hasSize(1);
        assertThat(json(got.get(0)).get("value").asText()).isEqualTo("good");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }
}
