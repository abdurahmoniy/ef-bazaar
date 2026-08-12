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
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class InvoiceExpirySweeperIT extends AbstractPostgresIT {

    @Autowired InvoiceExpirySweeper sweeper;
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
