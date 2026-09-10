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
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.test.utils.ContainerTestUtils;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.debit.repository.CardDebitObservationRepository;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * The debit half of what {@link CardCreditConsumerIT} pins down.
 *
 * <p>The only producer on this topic is the Python humo-userbot, which sends
 * plain JSON and stamps no {@code __TypeId__} header. Without the
 * {@code spring.json.value.default.type} declaration on the listener,
 * {@code JsonDeserializer} has nothing to build and every debit is dropped in
 * silence — no exception, no stall, no log line. Every other test in this task
 * calls {@code ByCardDebitService.ingest} directly and would stay green with
 * the listener completely dead, so this one publishes raw bytes exactly as the
 * userbot does.
 */
@SpringBootTest
class CardDebitConsumerIT extends AbstractIntegrationIT {

    private static final Instant OBSERVED_AT = Instant.parse("2026-09-10T20:34:00Z");

    @Autowired CardDebitObservationRepository debits;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired uz.efbazaar.payment.invoice.repository.InvoiceRepository invoices;
    @Autowired uz.efbazaar.payment.observation.repository.CardCreditObservationRepository
            creditObservations;
    @Autowired KafkaListenerEndpointRegistry listeners;

    /**
     * auto.offset.reset is {@code latest}: anything published before the
     * consumer owns the partition is never seen, which would make this test
     * pass or fail on startup timing rather than on the behaviour it pins.
     */
    @BeforeEach
    void waitForTheListenerToOwnItsPartition() {
        // Children before parents: the Postgres container is shared with every
        // other IT, and cards left behind by another class may still be
        // referenced by its invoices — deleting the cards first fails on
        // invoices_card_id_fkey, and which class breaks depends on run order.
        creditObservations.deleteAll();
        invoices.deleteAll();
        debits.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));

        for (MessageListenerContainer container : listeners.getListenerContainers()) {
            ContainerTestUtils.waitForAssignment(container, 1);
        }
    }

    @Test
    void aBareJsonDebitFromTheNonJavaProducerIsRecorded() {
        long messageId = 88_101L;

        // Byte-for-byte what humo_userbot/kafka_client.py builds for the real
        // captured notice: camelCase keys, no headers, a literal-Z timestamp.
        publishRaw(("""
                {"telegramMessageId":%d,"cardLast4":"0101","amountTiyin":1000000,\
                "commissionTiyin":0,"cardBalanceTiyin":4400000,\
                "description":"Openbank P2P HUMO OT","observedAt":"2026-09-10T20:34:00Z",\
                "rawText":"💸 Amaliyot"}"""
                .formatted(messageId))
                .getBytes(StandardCharsets.UTF_8));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            var obs = debits.findByTelegramMessageId(messageId);
            assertThat(obs)
                    .as("a debit carrying no Java type header is still a debit")
                    .isPresent();
            assertThat(obs.orElseThrow().getAmountTiyin()).isEqualTo(1_000_000L);
            assertThat(obs.orElseThrow().getObservedAt())
                    .as("the userbot's literal-Z string must land as an Instant")
                    .isEqualTo(OBSERVED_AT);
            assertThat(obs.orElseThrow().getDescription()).isEqualTo("Openbank P2P HUMO OT");
            assertThat(cardRepo.findAll().get(0).getBalanceTiyin()).isEqualTo(4_400_000L);
        });
    }

    /**
     * The notice the bank sends without a commission line — the second of the
     * two real captures. The optional fields must survive as null rather than
     * failing the record on the way in.
     */
    @Test
    void aDebitWithoutTheOptionalFieldsIsStillRecorded() {
        long messageId = 88_102L;

        publishRaw(("""
                {"telegramMessageId":%d,"cardLast4":"0101","amountTiyin":402000,\
                "commissionTiyin":null,"cardBalanceTiyin":98000,"description":null,\
                "observedAt":"2026-09-10T20:43:00Z","rawText":"💸 Amaliyot"}"""
                .formatted(messageId))
                .getBytes(StandardCharsets.UTF_8));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            var obs = debits.findByTelegramMessageId(messageId);
            assertThat(obs).isPresent();
            assertThat(obs.orElseThrow().getCommissionTiyin()).isNull();
            assertThat(obs.orElseThrow().getDescription()).isNull();
        });
    }

    /** Bypasses the app's producer on purpose — the point is headerless bytes. */
    private void publishRaw(byte[] payload) {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        try (var producer = new KafkaProducer<String, byte[]>(props)) {
            producer.send(new ProducerRecord<>(PaymentTopics.CARD_DEBIT_OBSERVED, payload));
            producer.flush();
        }
    }
}
