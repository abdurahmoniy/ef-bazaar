package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class SlotAllocatorIT extends AbstractPostgresIT {

    @Autowired SlotAllocator allocator;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired InvoiceRepository invoices;

    private static final long UZS = 100;  // tiyin per UZS

    @BeforeEach
    void clean() {
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
    }

    private void givenCards(String... pans) {
        UUID admin = UUID.randomUUID();
        int i = 0;
        for (String pan : pans) {
            cards.create(admin, new PlatformCardCreateRequest(
                    pan, "HOLDER " + (++i), (short) 12, (short) 2030));
        }
    }

    @Test
    void theFirstInvoiceTakesThePrimaryCardAtTheRequestedAmount() {
        givenCards("9860160101080101", "9860160102050202");

        Invoice inv = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);

        assertThat(inv.getTransferAmountTiyin()).isEqualTo(100_000 * UZS);
        assertThat(inv.getRequestedAmountTiyin()).isEqualTo(100_000 * UZS);
        assertThat(cardRepo.findById(inv.getCardId()).orElseThrow().getDisplayOrder())
                .as("primary card first")
                .isEqualTo(1);
    }

    @Test
    void aSecondInvoiceForTheSameAmountFallsToTheNextCard() {
        givenCards("9860160101080101", "9860160102050202");

        Invoice first  = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        Invoice second = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);

        assertThat(second.getCardId()).isNotEqualTo(first.getCardId());
        assertThat(second.getTransferAmountTiyin())
                .as("same amount, different card — no bump needed yet")
                .isEqualTo(100_000 * UZS);
    }

    @Test
    void whenEveryCardIsBusyTheAmountIsBumped() {
        givenCards("9860160101080101", "9860160102050202");

        allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        Invoice third = allocator.allocate(UUID.randomUUID(), 100_000 * UZS);

        assertThat(third.getTransferAmountTiyin()).isEqualTo(100_100 * UZS);
        assertThat(third.getRequestedAmountTiyin())
                .as("the user is still credited what they asked for")
                .isEqualTo(100_000 * UZS);
    }

    @Test
    void theBumpCeilingRefusesRatherThanClimbingForever() {
        givenCards("9860160101080101");

        // One card, step 100, ceiling 1000 -> 11 slots (bump 0..1000).
        for (int i = 0; i <= 10; i++) {
            allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
        }

        assertThatThrownBy(() -> allocator.allocate(UUID.randomUUID(), 100_000 * UZS))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
    }

    @Test
    void withNoActiveCardsAllocationRefuses() {
        assertThatThrownBy(() -> allocator.allocate(UUID.randomUUID(), 100_000 * UZS))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
    }

    @Test
    void concurrentRequestsForTheSameAmountNeverShareASlot() throws Exception {
        givenCards("9860160101080101", "9860160102050202",
                   "9860160103020303", "9860160104090404");

        int threads = 4;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Invoice>> futures = new ArrayList<>();

        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                go.await(5, TimeUnit.SECONDS);
                return allocator.allocate(UUID.randomUUID(), 100_000 * UZS);
            }));
        }
        go.countDown();

        List<Invoice> allocated = new ArrayList<>();
        for (Future<Invoice> f : futures) {
            allocated.add(f.get(30, TimeUnit.SECONDS));
        }
        pool.shutdown();

        Set<String> slots = allocated.stream()
                .map(i -> i.getCardId() + ":" + i.getTransferAmountTiyin())
                .collect(Collectors.toSet());

        assertThat(slots)
                .as("four concurrent allocations must occupy four distinct slots")
                .hasSize(threads);
    }
}
