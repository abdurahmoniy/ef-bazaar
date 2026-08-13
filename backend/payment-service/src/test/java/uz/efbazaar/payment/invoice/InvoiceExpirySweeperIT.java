package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.InvoiceExpirySweeper;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class InvoiceExpirySweeperIT extends AbstractPostgresIT {

    @Autowired InvoiceExpirySweeper sweeper;
    @Autowired InvoiceService invoiceService;
    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoices;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;

    @BeforeEach
    void clean() {
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
    }

    @Test
    void aDueInvoiceExpiresAndAFreshOneIsUnaffected() {
        var due = allocator.allocate(UUID.randomUUID(), 10_000_000);
        due.setExpiresAt(Instant.now().minusSeconds(1));
        invoices.save(due);

        var fresh = allocator.allocate(UUID.randomUUID(), 20_000_000);

        sweeper.sweep();

        assertThat(invoices.findById(due.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.EXPIRED);
        assertThat(invoices.findById(fresh.getId()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PENDING);
    }

    /**
     * Race A. The sweeper reads its snapshot with {@code findDue} and then
     * writes every column back; a payment landing in between is overwritten, so
     * the row ends EXPIRED with {@code paid_at} and {@code observation_id}
     * wiped while the user has the money and the observation says MATCHED. The
     * money is right and the reconciliation trail is a lie — the worst kind of
     * bug to find later, because nothing looks broken.
     *
     * <p>The claim is one-directional on purpose: losing the race is fine and
     * expected (a payment that arrives after expiry belongs in the admin
     * queue), but a {@code markPaid} that reports success must leave a PAID
     * row behind.
     */
    @Test
    void aPaymentLandingMidSweepIsNeverOverwrittenByTheSweep() throws Exception {
        for (int iteration = 0; iteration < 20; iteration++) {
            invoices.deleteAll();
            var inv = allocator.allocate(UUID.randomUUID(), 10_000_000);
            inv.setExpiresAt(Instant.now().minusSeconds(1));
            invoices.save(inv);
            var payerSnapshot = invoices.findById(inv.getId()).orElseThrow();
            UUID observationId = UUID.randomUUID();

            ExecutorService pool = Executors.newFixedThreadPool(2);
            CountDownLatch go = new CountDownLatch(1);
            Future<?> sweep = pool.submit(() -> {
                go.await(5, TimeUnit.SECONDS);
                sweeper.sweep();
                return null;
            });
            Future<Boolean> pay = pool.submit(() -> {
                go.await(5, TimeUnit.SECONDS);
                return invoiceService.markPaid(payerSnapshot, observationId);
            });
            go.countDown();

            sweep.get(30, TimeUnit.SECONDS);
            boolean claimed = pay.get(30, TimeUnit.SECONDS);
            pool.shutdown();

            if (claimed) {
                var row = invoices.findById(inv.getId()).orElseThrow();
                assertThat(row.getStatus())
                        .as("iteration %d — the sweep must not un-pay a paid invoice", iteration)
                        .isEqualTo(InvoiceStatus.PAID);
                assertThat(row.getObservationId())
                        .as("iteration %d — nor erase which payment funded it", iteration)
                        .isEqualTo(observationId);
                assertThat(row.getPaidAt()).isNotNull();
            }
        }
    }

    @Test
    void expiringReleasesTheSlotForSomebodyElse() {
        var first = allocator.allocate(UUID.randomUUID(), 10_000_000);
        first.setExpiresAt(Instant.now().minusSeconds(1));
        invoices.save(first);

        sweeper.sweep();

        var second = allocator.allocate(UUID.randomUUID(), 10_000_000);
        assertThat(second.getCardId()).isEqualTo(first.getCardId());
        assertThat(second.getTransferAmountTiyin())
                .as("the freed slot is reused at the same amount, no bump")
                .isEqualTo(first.getTransferAmountTiyin());
    }
}
