package uz.efbazaar.payment.observation;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Needs a broker, so {@link AbstractIntegrationIT} rather than the Postgres-only
 * base: crediting publishes {@code efbazaar.payment.deposit-credited} from inside
 * the same transaction, and with no broker {@code KafkaTemplate.send} blocks for
 * {@code max.block.ms} and then throws {@code KafkaException: Send failed},
 * rolling the credit back. That is the right production behaviour — an
 * uncommitted offset is redelivered, so nothing is lost — but it means this
 * suite cannot be run without Kafka.
 */
@SpringBootTest
class ByCardServiceIT extends AbstractIntegrationIT {

    @Autowired ByCardService byCard;
    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoices;
    @Autowired CardCreditObservationRepository observations;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired LedgerService ledger;

    private static final AtomicLong MSG = new AtomicLong(1);

    @BeforeEach
    void clean() {
        observations.deleteAll();
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
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

    private CardCreditEvent event(String last4, long amountTiyin) {
        return new CardCreditEvent(MSG.getAndIncrement(), last4, amountTiyin,
                3_165_916L, Instant.now(), "🎉 To'ldirish ...");
    }

    @Test
    void exactlyOneMatchCreditsTheUser() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        var obs = byCard.ingest(event("0101", inv.getTransferAmountTiyin()));

        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.MATCHED);
        assertThat(invoices.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PAID);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
    }

    @Test
    void aBumpedInvoiceCreditsTheRequestedAmountAndBooksTheRest() {
        // Fill the only card at 100 000 so the second invoice is bumped.
        allocator.allocate(UUID.randomUUID(), 10_000_000);
        UUID user = UUID.randomUUID();
        Invoice bumped = allocator.allocate(user, 10_000_000);
        assertThat(bumped.getTransferAmountTiyin()).isEqualTo(10_010_000);

        byCard.ingest(event("0101", 10_010_000));

        assertThat(ledger.balanceOf(user).getAvailableTiyin())
                .as("the user gets what they asked for, not what they sent")
                .isEqualTo(10_000_000);
    }

    @Test
    void noMatchingInvoiceCreditsNothing() {
        UUID user = UUID.randomUUID();
        allocator.allocate(user, 10_000_000);

        var obs = byCard.ingest(event("0101", 7_777_777));

        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isZero();
    }

    @Test
    void anExpiredInvoiceIsNotMatchedEvenThoughTheAmountFits() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        inv.setExpiresAt(Instant.now().minusSeconds(1));
        invoices.save(inv);

        var obs = byCard.ingest(event("0101", inv.getTransferAmountTiyin()));

        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isZero();
        assertThat(invoices.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PENDING);
    }

    @Test
    void aCardWeDoNotOwnIsIgnored() {
        var obs = byCard.ingest(event("9999", 10_000_000));
        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.IGNORED);
    }

    @Test
    void aReplayedMessageCreditsOnce() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        var e = event("0101", inv.getTransferAmountTiyin());

        byCard.ingest(e);
        byCard.ingest(e);

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
        assertThat(observations.count()).isEqualTo(1);
    }

    @Test
    void theCardBalanceIsRecordedFromTheMessage() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        byCard.ingest(event("0101", inv.getTransferAmountTiyin()));

        var card = cardRepo.findByLast4AndActiveTrue("0101").orElseThrow();
        assertThat(card.getBalanceTiyin()).isEqualTo(3_165_916);
        assertThat(card.getBalanceObservedAt()).isNotNull();
    }

    @Test
    void anObservationAlwaysKeepsTheRawMessage() {
        byCard.ingest(event("0101", 12_345));
        assertThat(observations.findAll())
                .allSatisfy(o -> assertThat(o.getRawText()).isNotBlank());
    }
}
