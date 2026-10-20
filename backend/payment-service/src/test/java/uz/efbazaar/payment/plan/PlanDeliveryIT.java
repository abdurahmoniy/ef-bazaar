package uz.efbazaar.payment.plan;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import uz.efbazaar.outbox.OutboxProperties;
import uz.efbazaar.outbox.internal.*;
import uz.efbazaar.payment.kafka.PaymentTopics;
import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.dto.PurchasePlanRequest;
import uz.efbazaar.payment.plan.service.PlanPurchaseService;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/** Isolated database: cached test contexts must not relay this test's queue. */
@SpringBootTest(properties = "outbox.relay.send-timeout=2s")
@Import(PlanDeliveryIT.Transport.class)
@DirtiesContext
class PlanDeliveryIT extends AbstractIntegrationIT {
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:16-alpine");
    static { DB.start(); }
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::getJdbcUrl);
        r.add("spring.datasource.username", DB::getUsername);
        r.add("spring.datasource.password", DB::getPassword);
    }
    @TestConfiguration
    static class Transport {
        @Bean(destroyMethod = "destroy")
        RecoverableSender recoverableSender(ProducerFactory<?, ?> factory) {
            return new RecoverableSender(factory);
        }
    }
    static class RecoverableSender extends KafkaOutboxSender {
        volatile boolean unavailable = true;
        RecoverableSender(ProducerFactory<?, ?> factory) { super(factory, Duration.ofSeconds(2)); }
        @Override public CompletableFuture<?> send(String topic, String key, byte[] payload, List<Header> headers) {
            if (unavailable) return CompletableFuture.failedFuture(new org.apache.kafka.common.errors.TimeoutException("broker unavailable"));
            return super.send(topic, key, payload, headers);
        }
    }
    @Autowired PlanPurchaseService purchases;
    @Autowired LedgerService ledger;
    @Autowired JdbcTemplate jdbc;
    @Autowired OutboxRelay relay;
    @Autowired OutboxRepository repository;
    @Autowired MessageEncoder encoder;
    @Autowired OutboxProperties properties;
    @Autowired TransactionTemplate tx;
    @Autowired RecoverableSender sender;
    @Autowired ObjectMapper json;

    @Test
    void purchaseSurvivesTransportOutageAndNewRelayDeliversCommittedBytes() throws Exception {
        UUID user = UUID.randomUUID();
        ledger.post(TransactionKind.DEPOSIT, "delivery-" + user, null, null, List.of(
                new LedgerService.Posting(LedgerAccount.PLATFORM_CARDS, null, 5_000_000),
                new LedgerService.Posting(LedgerAccount.USER_AVAILABLE, user, -5_000_000)));
        var request = new PurchasePlanRequest("PRO", PlanPeriod.MONTH, 3_000_000L, UUID.randomUUID().toString());
        assertThat(purchases.purchase(user, null, request).code()).isEqualTo("PRO");
        relay.drainNow();
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(2_000_000L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE message_key=? AND published_at IS NULL",
                Long.class, user.toString())).isEqualTo(1L);
        byte[] committed = jdbc.queryForObject("SELECT payload FROM outbox_events WHERE message_key=?", byte[].class, user.toString());
        var event = json.readTree(committed);
        assertThat(event.path("version").asLong()).isPositive();
        assertThat(event.path("idempotencyKey").asText()).isNotBlank();
        // New relay has no in-memory knowledge of the transaction that created this event.
        relay.shutdown();
        sender.unavailable = false;
        var restarted = new OutboxRelay(repository, sender, tx, properties, List.of(), encoder, new SimpleMeterRegistry());
        try {
            restarted.drainNow();
            await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
                restarted.drainNow();
                assertThat(jdbc.queryForObject("SELECT published_at IS NOT NULL FROM outbox_events WHERE message_key=?",
                        Boolean.class, user.toString())).isTrue();
            });
            Map<String, Object> props = Map.of(
                    ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                    ConsumerConfig.GROUP_ID_CONFIG, "plan-delivery-" + user,
                    ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                    ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                    ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
            List<String> delivered = new ArrayList<>();
            try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
                consumer.subscribe(List.of(PaymentTopics.SUBSCRIPTION_CHANGED));
                await().atMost(Duration.ofSeconds(20)).until(() -> {
                    consumer.poll(Duration.ofMillis(200)).forEach(record -> {
                        if (user.toString().equals(record.key())) delivered.add(record.value());
                    });
                    return !delivered.isEmpty();
                });
            }
            assertThat(json.readTree(delivered.getFirst())).isEqualTo(event);
        } finally { restarted.shutdown(); }
    }
}
