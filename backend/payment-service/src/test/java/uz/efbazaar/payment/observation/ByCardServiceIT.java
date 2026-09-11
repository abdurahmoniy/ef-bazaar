package uz.efbazaar.payment.observation;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.kafka.PaymentEventPublisher.DepositCreditedSignal;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Kept on {@link AbstractIntegrationIT} rather than the Postgres-only base.
 * Crediting used to publish {@code efbazaar.payment.deposit-credited} from
 * inside the crediting transaction, which without a broker blocked for
 * {@code max.block.ms} and then rolled the credit back; that publish is now an
 * AFTER_COMMIT listener, so the credit itself no longer depends on Kafka. The
 * broker stays because the listener still runs and a send that throws in a test
 * teardown is noise nobody should have to diagnose.
 */
@SpringBootTest
@RecordApplicationEvents
class ByCardServiceIT extends AbstractIntegrationIT {

    @Autowired ByCardService byCard;
    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoices;
    @Autowired CardCreditObservationRepository observations;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired LedgerService ledger;
    @Autowired ApplicationEvents events;

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

    /**
     * Race B. Two observations naming the same live slot both read it as
     * PENDING. The ledger's {@code invoice-<id>} idempotency key correctly stops
     * the second credit, so the money is right — but the second {@code markPaid}
     * succeeds on a stale snapshot and its observation is filed MATCHED against
     * an invoice it never funded. That is a second real payment swallowed: no
     * queue row, no alert, and the only trace is a wallet that is short.
     *
     * <p>Unreachable in production today only because listener concurrency is 1
     * and the topic has one partition, and nothing in the code records that
     * dependency. Exactly one observation may come out MATCHED however the
     * threads interleave.
     */
    @Test
    void onlyOneOfSeveralObservationsForTheSameSlotIsEverMatched() throws Exception {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        long amount = inv.getTransferAmountTiyin();

        int threads = 6;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                go.await(5, TimeUnit.SECONDS);
                return byCard.ingest(event("0101", amount));
            }));
        }
        go.countDown();
        for (Future<?> f : futures) {
            f.get(60, TimeUnit.SECONDS);
        }
        pool.shutdown();

        long matched = observations.findAll().stream()
                .filter(o -> o.getStatus() == ObservationStatus.MATCHED)
                .count();
        assertThat(matched)
                .as("a second payment must be queued for an admin, not filed against "
                        + "an invoice it did not fund")
                .isEqualTo(1);
        assertThat(observations.count()).isEqualTo(threads);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
        assertThat(invoices.findById(inv.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PAID);
    }

    /**
     * {@code require()} reads the observation with a plain {@code findById}, so
     * two admins working the same queue row both see UNMATCHED and both post
     * with the key {@code obs-manual-<id>}. The ledger returns the winner's
     * transaction id to the loser and writes nothing — but the loser's HTTP call
     * still returns 200 MANUALLY_RESOLVED. Admin B is told they credited user B
     * while user A has the money, on an action no screen in this platform can
     * undo.
     */
    @Test
    void twoAdminsResolvingTheSameObservationCannotBothBeToldTheyCreditedSomebody()
            throws Exception {
        var obs = byCard.ingest(event("0101", 7_777_777));
        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);

        UUID targetA = UUID.randomUUID();
        UUID targetB = UUID.randomUUID();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<UUID>> futures = new ArrayList<>();
        for (UUID target : List.of(targetA, targetB)) {
            futures.add(pool.submit(() -> {
                go.await(5, TimeUnit.SECONDS);
                byCard.resolveManually(obs.getId(), target, UUID.randomUUID(), "biriktirildi");
                return target;
            }));
        }
        go.countDown();

        int credited = 0;
        int conflicted = 0;
        for (Future<UUID> f : futures) {
            try {
                f.get(60, TimeUnit.SECONDS);
                credited++;
            } catch (ExecutionException e) {
                assertThat(e.getCause())
                        .isInstanceOf(ResponseStatusException.class)
                        .hasMessageContaining("409");
                conflicted++;
            }
        }
        pool.shutdown();

        assertThat(credited).as("exactly one admin may be told the credit happened")
                .isEqualTo(1);
        assertThat(conflicted).as("the other must be told the row was already taken")
                .isEqualTo(1);

        long toA = ledger.balanceOf(targetA).getAvailableTiyin();
        long toB = ledger.balanceOf(targetB).getAvailableTiyin();
        assertThat(toA + toB)
                .as("the money arrived exactly once")
                .isEqualTo(7_777_777);
    }
    // --- announcing the credit ---------------------------------------------
    //
    // Both paths that put money in a wallet must say so. The manual one used to
    // be silent, which is the case where the user has been waiting longest and
    // is least sure anything is happening.

    private List<DepositCreditedSignal> creditSignals() {
        return events.stream(DepositCreditedSignal.class).toList();
    }

    @Test
    void aMatchedDepositAnnouncesWhatReachedTheWallet() {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        byCard.ingest(new CardCreditEvent(MSG.getAndIncrement(), "0101",
                inv.getTransferAmountTiyin(), null, Instant.now(), "raw"));

        assertThat(creditSignals()).singleElement().satisfies(signal -> {
            assertThat(signal.userId()).isEqualTo(user);
            // What the wallet received, not what was transferred: the bump is
            // the platform's disambiguation charge, not the user's deposit.
            assertThat(signal.amountTiyin()).isEqualTo(10_000_000L);
            assertThat(signal.invoiceId()).isEqualTo(inv.getId());
            assertThat(signal.transactionId())
                    .as("the dedupe key a consumer needs")
                    .isNotNull();
        });
    }

    @Test
    void aManuallyAttributedPaymentAnnouncesItTheSameWay() {
        UUID user = UUID.randomUUID();
        var obs = byCard.ingest(new CardCreditEvent(MSG.getAndIncrement(), "0101",
                777_000L, null, Instant.now(), "raw"));
        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);

        byCard.resolveManually(obs.getId(), user, UUID.randomUUID(), "bank cheki tekshirildi");

        assertThat(creditSignals()).singleElement().satisfies(signal -> {
            assertThat(signal.userId()).isEqualTo(user);
            assertThat(signal.amountTiyin()).isEqualTo(777_000L);
            // There was no invoice. Absence is the shape of this path, not a
            // defect a consumer should reject the record over.
            assertThat(signal.invoiceId()).isNull();
            assertThat(signal.transactionId()).isNotNull();
        });
    }

    /** An unmatched payment is not money in anybody's wallet yet. */
    @Test
    void aQueuedPaymentAnnouncesNothing() {
        byCard.ingest(new CardCreditEvent(MSG.getAndIncrement(), "0101",
                4_242_000L, null, Instant.now(), "raw"));

        assertThat(creditSignals()).isEmpty();
    }

    /** Neither is one on a card the platform does not own. */
    @Test
    void aPaymentOnSomebodyElsesCardAnnouncesNothing() {
        byCard.ingest(new CardCreditEvent(MSG.getAndIncrement(), "9999",
                1_000_000L, null, Instant.now(), "raw"));

        assertThat(creditSignals()).isEmpty();
    }
}
