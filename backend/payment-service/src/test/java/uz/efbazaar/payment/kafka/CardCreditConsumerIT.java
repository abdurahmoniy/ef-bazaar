package uz.efbazaar.payment.kafka;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.test.utils.ContainerTestUtils;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * The only producer on {@code efbazaar.payment.card-credit-observed} is the
 * Python humo-userbot, which sends plain JSON and stamps no headers at all —
 * in particular no {@code __TypeId__}, the header a Java
 * {@code KafkaTemplate}/{@code JsonSerializer} would add and that
 * {@code JsonDeserializer} otherwise needs to know what to build.
 *
 * <p>Every other test in this task calls {@code ByCardService.ingest} directly
 * and would stay green with the listener completely dead: no exception, no
 * stall, no log line — a dropped record is silent, and the deposit simply
 * never arrives. So this test publishes raw bytes exactly as the userbot does
 * and asserts the money reached the wallet, which is the only way the
 * {@code spring.json.value.default.type} declaration on the listener is
 * actually pinned down.
 */
@SpringBootTest
class CardCreditConsumerIT extends AbstractIntegrationIT {

    private static final Instant OBSERVED_AT = Instant.parse("2026-08-10T20:41:00Z");

    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoices;
    @Autowired CardCreditObservationRepository observations;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired LedgerService ledger;
    @Autowired KafkaListenerEndpointRegistry listeners;

    /**
     * auto.offset.reset is {@code latest}: anything published before the
     * consumer owns the partition is never seen at all, which would make this
     * test pass or fail on startup timing rather than on the behaviour it
     * means to pin down.
     */
    @BeforeEach
    void waitForTheListenerToOwnItsPartition() {
        observations.deleteAll();
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));

        for (MessageListenerContainer container : listeners.getListenerContainers()) {
            ContainerTestUtils.waitForAssignment(container, 1);
        }
    }

    /**
     * Not just tidiness: {@code card_credit_observations.invoice_id} has an FK
     * to {@code invoices}, and every other IT in this module starts with
     * {@code invoices.deleteAll()} against the same shared container. A matched
     * observation left behind here makes that delete fail with a foreign-key
     * violation, so whichever classes happen to run after this one break.
     */
    @AfterEach
    void leaveNoObservationsBehind() {
        observations.deleteAll();
    }

    @Test
    void aBareJsonCardCreditFromTheNonJavaProducerCreditsTheWallet() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        long messageId = 77_001L;

        // Byte-for-byte what humo_userbot/main.py builds: camelCase keys, no
        // headers, observedAt rendered by iso_z() as a literal-Z string.
        publishRaw(("""
                {"telegramMessageId":%d,"cardLast4":"0101","amountTiyin":%d,\
                "cardBalanceTiyin":3165916,"observedAt":"2026-08-10T20:41:00Z",\
                "rawText":"Xaridingiz uchun rahmat! Karta *0101"}"""
                .formatted(messageId, inv.getTransferAmountTiyin()))
                .getBytes(StandardCharsets.UTF_8));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            var obs = observations.findByUserbotTelegramIdAndTelegramMessageId(null, messageId);
            assertThat(obs)
                    .as("a card credit carrying no Java type header is still a card credit")
                    .isPresent();
            assertThat(obs.orElseThrow().getStatus()).isEqualTo(ObservationStatus.MATCHED);
            assertThat(obs.orElseThrow().getObservedAt())
                    .as("the userbot's literal-Z string must land as an Instant")
                    .isEqualTo(OBSERVED_AT);
            assertThat(invoices.findById(inv.getId()).orElseThrow().getStatus())
                    .isEqualTo(InvoiceStatus.PAID);
            assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
        });
    }

    /**
     * The userbot names the account that saw the message; payment keys on the
     * pair. If Jackson silently ignored the field (two record constructors make
     * that a real risk) the row would land with NULL and collide with the next
     * account's message of the same id.
     */
    @Test
    void theAccountIdInBareJsonReachesTheObservation() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        long messageId = 77_003L;

        publishRaw(("""
                {"telegramMessageId":%d,"cardLast4":"0101","amountTiyin":%d,\
                "cardBalanceTiyin":3165916,"observedAt":"2026-08-10T20:41:00Z",\
                "rawText":"Xaridingiz uchun rahmat! Karta *0101","userbotTelegramId":5550001}"""
                .formatted(messageId, inv.getTransferAmountTiyin()))
                .getBytes(StandardCharsets.UTF_8));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() ->
                assertThat(observations.findByUserbotTelegramIdAndTelegramMessageId(5550001L, messageId))
                        .hasValueSatisfying(o -> assertThat(o.getStatus()).isEqualTo(ObservationStatus.MATCHED)));
        assertThat(observations.findByUserbotTelegramIdAndTelegramMessageId(null, messageId)).isEmpty();
    }

    /**
     * {@code observed_at} and {@code raw_text} are both NOT NULL in V4, so a
     * record missing either reaches {@code observations.save} and blows up
     * there. With no error handler anywhere the container simply retries, gives
     * up, seeks past the record and commits the offset — and that record is
     * money the platform physically received, gone with one log line, no queue
     * row and no alert. It has to land somewhere an operator can find it.
     */
    @Test
    void aRecordMissingItsRawTextIsParkedOnTheDeadLetterTopicRatherThanDropped() {
        long messageId = 77_002L;

        publishRaw(("""
                {"telegramMessageId":%d,"cardLast4":"0101","amountTiyin":10000000,\
                "cardBalanceTiyin":3165916,"observedAt":"2026-08-10T20:41:00Z"}"""
                .formatted(messageId))
                .getBytes(StandardCharsets.UTF_8));

        List<String> parked = new ArrayList<>();
        try (KafkaConsumer<String, String> dlt = deadLetterConsumer()) {
            await().atMost(Duration.ofSeconds(60)).pollInterval(Duration.ofMillis(500))
                    .untilAsserted(() -> {
                        dlt.poll(Duration.ofMillis(500))
                                .forEach(r -> parked.add(r.value()));
                        assertThat(parked)
                                .as("a top-up the platform received must never vanish silently")
                                .anySatisfy(v -> assertThat(v).contains(String.valueOf(messageId)));
                    });
        }

        assertThat(observations.findByUserbotTelegramIdAndTelegramMessageId(null, messageId))
                .as("the malformed record must not have half-written a row either")
                .isEmpty();
    }

    private KafkaConsumer<String, String> deadLetterConsumer() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "dlt-probe-" + UUID.randomUUID());
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(List.of(
                PaymentTopics.CARD_CREDIT_OBSERVED + PaymentTopics.DLT_SUFFIX));
        return consumer;
    }

    /** Bypasses the app's producer on purpose — the point is headerless bytes. */
    private void publishRaw(byte[] payload) {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        try (var producer = new KafkaProducer<String, byte[]>(props)) {
            producer.send(new ProducerRecord<>(PaymentTopics.CARD_CREDIT_OBSERVED, payload));
            producer.flush();
        }
    }
}
