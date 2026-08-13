package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.dto.InvoiceResponse;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.testsupport.ClockTestConfig;
import uz.efbazaar.payment.testsupport.MutableClock;

import java.time.Duration;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(ClockTestConfig.class)
class InvoiceServiceIT extends AbstractPostgresIT {

    @Autowired InvoiceService invoices;
    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoiceRepo;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired UserbotHealth userbotHealth;
    @Autowired MutableClock clock;

    @Value("${payment.userbot.heartbeat-timeout-seconds}")
    long heartbeatTimeoutSeconds;

    /**
     * UserbotHealth and the injected clock are singletons shared across the
     * whole test run, so every test re-establishes the state it needs here
     * rather than trusting what a previous test (in this class or another)
     * left behind. Resetting the clock to a real "now" before stamping a
     * fresh beat keeps this class order-independent regardless of what ran
     * before it.
     */
    @BeforeEach
    void clean() {
        invoiceRepo.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "aziz karimov", (short) 12, (short) 2030));
        clock.reset(Instant.now());
        userbotHealth.record(clock.instant());
    }

    @Test
    void anInvoiceCarriesEverythingThePayerNeeds() {
        var res = invoices.create(UUID.randomUUID(), 100_000);

        assertThat(res.pan()).isEqualTo("9860160101080101");
        assertThat(res.holderName()).isEqualTo("AZIZ KARIMOV");
        assertThat(res.cardExpiry()).isEqualTo("12/30");
        assertThat(res.transferTiyin()).isEqualTo(10_000_000);
        assertThat(res.requestedTiyin()).isEqualTo(10_000_000);
        assertThat(res.expiresAt()).isNotNull();
    }

    @Test
    void belowTheMinimumIsRefused() {
        assertThatThrownBy(() -> invoices.create(UUID.randomUUID(), 500))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void aUserMayOnlyHaveOneLiveInvoice() {
        UUID user = UUID.randomUUID();
        invoices.create(user, 100_000);

        assertThatThrownBy(() -> invoices.create(user, 50_000))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409")
                .hasMessageContaining("tugallanmagan");
    }

    /**
     * The 30-second window between an invoice expiring and the sweeper reaching
     * it. Both answers are a 409, but they mean opposite things to the person
     * reading them: one says "finish what you started", the other says "wait a
     * moment". Telling a user whose countdown just hit zero that they have an
     * unfinished top-up contradicts their own screen and offers them no action,
     * and a confused user re-sends the old amount — which no longer matches
     * anything and becomes an admin's manual queue row.
     */
    @Test
    void anInvoiceAwaitingTheSweeperSaysSoRatherThanBlamingTheUser() {
        UUID user = UUID.randomUUID();
        InvoiceResponse first = invoices.create(user, 100_000);

        var row = invoiceRepo.findById(first.id()).orElseThrow();
        row.setExpiresAt(Instant.now().minusSeconds(1));
        invoiceRepo.save(row);

        assertThatThrownBy(() -> invoices.create(user, 100_000))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409")
                .hasMessageContaining("yopilmoqda")
                .as("an expired-but-unswept row must not be reported as unfinished work")
                .hasMessageNotContaining("tugallanmagan");
    }

    /**
     * Proves the gate both opens and closes. A test that fakes staleness by
     * rewinding the recorded beat would never actually flip isHealthy() —
     * UserbotHealth's monotonic guard rejects exactly that — and it doesn't
     * model anything that happens in production anyway: a real userbot goes
     * quiet while time keeps moving forward, so that is what this test does.
     */
    @Test
    void aStaleUserbotStopsNewInvoices() {
        userbotHealth.record(clock.instant());
        invoices.create(UUID.randomUUID(), 100_000);

        clock.advance(Duration.ofSeconds(heartbeatTimeoutSeconds + 1));

        assertThatThrownBy(() -> invoices.create(UUID.randomUUID(), 100_000))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
    }

    @Test
    void myActiveReturnsTheLiveInvoice() {
        UUID user = UUID.randomUUID();
        var created = invoices.create(user, 100_000);

        assertThat(invoices.myActive(user)).isPresent()
                .get().extracting(x -> x.id()).isEqualTo(created.id());
        assertThat(invoices.myActive(UUID.randomUUID())).isEmpty();
    }

    /**
     * The 0-row path. {@code Invoice} has no {@code @Version} and Hibernate's
     * default update writes every column, so a second {@code markPaid} holding
     * a snapshot taken before the first one committed still reads PENDING in
     * memory, sails past the status check and blind-writes the whole row —
     * stamping its own observation id over the observation that actually funded
     * the invoice. The ledger's {@code invoice-<id>} key stops the double
     * credit, so no money is created; what is lost is the record of which real
     * payment paid for it, and a second genuine payment gets recorded as MATCHED
     * against an invoice it never funded.
     *
     * <p>Two separately loaded snapshots, not two calls on one object: the
     * in-memory instance is mutated by the first call, which would make this
     * pass for the wrong reason.
     */
    @Test
    void aStaleSnapshotCannotTakeAnInvoiceThatSomebodyElseAlreadyPaid() {
        var inv = allocator.allocate(UUID.randomUUID(), 10_000_000);
        var winnerSnapshot = invoiceRepo.findById(inv.getId()).orElseThrow();
        var loserSnapshot = invoiceRepo.findById(inv.getId()).orElseThrow();
        UUID winnerObservation = UUID.randomUUID();
        UUID loserObservation = UUID.randomUUID();

        assertThat(invoices.markPaid(winnerSnapshot, winnerObservation))
                .as("the first payment takes the invoice")
                .isTrue();
        assertThat(invoices.markPaid(loserSnapshot, loserObservation))
                .as("the second must be told it got nothing, so its observation can queue")
                .isFalse();

        var row = invoiceRepo.findById(inv.getId()).orElseThrow();
        assertThat(row.getStatus()).isEqualTo(InvoiceStatus.PAID);
        assertThat(row.getObservationId())
                .as("the invoice must still name the observation that actually funded it")
                .isEqualTo(winnerObservation);
    }

    /**
     * The one-pending-invoice-per-user check in {@code create()} is a plain
     * read before allocating, so two concurrent requests from the same user
     * both pass it. That is fine — {@code uk_invoices_one_live_per_user}
     * still guarantees only one PENDING row ever persists. What this test
     * pins down is what the *loser* sees: it must get the same 409 the
     * sequential path gives, not a 503 from grinding through every
     * card/bump combination because the allocator couldn't tell "this slot
     * is taken" apart from "this user already has a live invoice."
     */
    @Test
    void concurrentSameUserRequestsProduceExactlyOneInvoiceAndOneConflict() throws Exception {
        int iterations = 5;
        for (int iter = 0; iter < iterations; iter++) {
            UUID user = UUID.randomUUID();

            ExecutorService pool = Executors.newFixedThreadPool(2);
            CountDownLatch go = new CountDownLatch(1);
            List<Future<InvoiceResponse>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                futures.add(pool.submit(() -> {
                    go.await(5, TimeUnit.SECONDS);
                    return invoices.create(user, 100_000);
                }));
            }
            go.countDown();

            int succeeded = 0;
            int conflicted = 0;
            for (Future<InvoiceResponse> f : futures) {
                try {
                    f.get(30, TimeUnit.SECONDS);
                    succeeded++;
                } catch (ExecutionException e) {
                    assertThat(e.getCause())
                            .as("iteration %d — the loser must get 409, not a 503 from an "
                                    + "exhausted card/bump search", iter)
                            .isInstanceOf(ResponseStatusException.class)
                            .hasMessageContaining("409");
                    conflicted++;
                }
            }
            pool.shutdown();

            assertThat(succeeded).as("iteration %d — exactly one winner", iter).isEqualTo(1);
            assertThat(conflicted).as("iteration %d — exactly one conflict", iter).isEqualTo(1);

            long pendingForUser = invoiceRepo.findAll().stream()
                    .filter(inv -> inv.getUserId().equals(user) && inv.getStatus() == InvoiceStatus.PENDING)
                    .count();
            assertThat(pendingForUser)
                    .as("iteration %d — exactly one live row for the user", iter)
                    .isEqualTo(1);
        }
    }
}
